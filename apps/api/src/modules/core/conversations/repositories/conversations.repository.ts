import { sql, type Selectable } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { ConversationsTable } from '../../../../kernel/database/types';

// The SQL for the `conversations` table. Every query names the business as well as the id (defence in depth: the database also
// fences every query by business).

export type ConversationChannelWord = 'webchat' | 'whatsapp' | 'email' | 'phone';

/** A conversation as the database holds it. */
export interface ConversationRow {
  id: string;
  channel: ConversationChannelWord;
  fromPhoneKey: string | null;
  fromEmail: string | null;
  contactId: string | null;
  typeKey: string | null;
  /** 0 to 1, or null before it is sorted. */
  typeConfidence: number | null;
  typeSource: 'rule' | 'ai_final' | 'staff' | null;
  typeReason: string | null;
  aiUnsure: boolean;
  needsPerson: boolean;
  /** A test chat from "Test the agent". */
  isTest: boolean;
  status: 'open' | 'sorted';
  endedAt: Date | null;
  sortedAt: Date | null;
  createdAt: Date;
}

/** Turns a database row into a ConversationRow (the confidence comes back from the database as text, so it is turned into a number). */
function toConversationRow(row: Selectable<ConversationsTable>): ConversationRow {
  return {
    id: row.id,
    channel: row.channel,
    fromPhoneKey: row.from_phone_key,
    fromEmail: row.from_email,
    contactId: row.contact_id,
    typeKey: row.type_key,
    typeConfidence: row.type_confidence === null ? null : Number(row.type_confidence),
    typeSource: row.type_source,
    typeReason: row.type_reason,
    aiUnsure: row.ai_unsure,
    needsPerson: row.needs_person,
    isTest: row.is_test,
    status: row.status,
    endedAt: row.ended_at,
    sortedAt: row.sorted_at,
    createdAt: row.created_at,
  };
}

/** Starts a conversation. It begins open, with no type. */
export async function insertConversation(
  db: Db,
  conversation: {
    id: string;
    accountId: string;
    channel: ConversationChannelWord;
    fromPhoneKey: string | null;
    fromEmail: string | null;
    contactId: string | null;
    /** True for a test chat ("Test the agent"). */
    isTest: boolean;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: conversation.actor.kind, id: conversation.actor.id };
  await db
    .insertInto('conversations')
    .values({
      id: conversation.id,
      account_id: conversation.accountId,
      channel: conversation.channel,
      from_phone_key: conversation.fromPhoneKey,
      from_email: conversation.fromEmail,
      contact_id: conversation.contactId,
      is_test: conversation.isTest,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One conversation of the business, or undefined when the id is unknown or belongs to another business. */
export async function findConversationById(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationRow | undefined> {
  const row = await db
    .selectFrom('conversations')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', conversationId)
    .executeTakeFirst();
  return row ? toConversationRow(row) : undefined;
}

/**
 * Reads one conversation and makes every other change to it wait until the end of this transaction (a row lock). Sorting takes this first,
 * so two sortings of the same conversation at the same moment take turns and the second finds it already sorted.
 */
export async function lockConversationById(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationRow | undefined> {
  const row = await db
    .selectFrom('conversations')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', conversationId)
    .forUpdate()
    .executeTakeFirst();
  return row ? toConversationRow(row) : undefined;
}

/** Notes when a conversation ended (only the first time: a conversation that already ended keeps its time). */
export async function markConversationEnded(
  db: Db,
  options: { accountId: string; conversationId: string; endedAt: Date; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ ended_at: options.endedAt, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .where('ended_at', 'is', null)
    .execute();
}

/** SQL for "the last thing said in this chat (or its start, when nothing was said) is older than the given time". */
const lastActivityIsBefore = (idleSince: Date) =>
  sql<boolean>`coalesce(
    (select max(created_at) from conversation_messages where conversation_messages.conversation_id = conversations.id),
    conversations.created_at
  ) < ${idleSince}`;

/**
 * The businesses that have a real chat of the channel that has gone quiet since `idleSince` and is not ended or sorted. Looks across ALL
 * businesses on purpose (a scheduled job has no business yet), so it takes the unfenced handle and answers business ids only.
 */
export async function listAccountIdsWithIdleChats(
  systemDb: Db,
  options: { channel: ConversationChannelWord; idleSince: Date },
): Promise<string[]> {
  const rows = await systemDb
    .selectFrom('conversations')
    .select('account_id')
    .distinct()
    .where('channel', '=', options.channel)
    .where('is_test', '=', false)
    .where('ended_at', 'is', null)
    .where('status', '=', 'open')
    .where(lastActivityIsBefore(options.idleSince))
    .execute();
  return rows.map((row) => row.account_id);
}

/** The ids of a business's real chats of the channel that have gone quiet since `idleSince` and are not ended or sorted, oldest first. */
export async function listIdleChatIds(
  db: Db,
  options: { accountId: string; channel: ConversationChannelWord; idleSince: Date; limit: number },
): Promise<string[]> {
  const rows = await db
    .selectFrom('conversations')
    .select('id')
    .where('account_id', '=', options.accountId)
    .where('channel', '=', options.channel)
    .where('is_test', '=', false)
    .where('ended_at', 'is', null)
    .where('status', '=', 'open')
    .where(lastActivityIsBefore(options.idleSince))
    .orderBy('created_at')
    .limit(options.limit)
    .execute();
  return rows.map((row) => row.id);
}

/** What sorting decided about a conversation. */
export interface SortedConversation {
  typeKey: string;
  typeConfidence: number;
  typeSource: 'rule' | 'ai_final' | 'staff';
  typeReason: string | null;
  aiUnsure: boolean;
  needsPerson: boolean;
  sortedAt: Date;
  actor: Actor;
}

/** Records the type, who decided it, and that the conversation is sorted. */
export async function saveSortedConversation(
  db: Db,
  options: { accountId: string; conversationId: string; sorted: SortedConversation },
): Promise<void> {
  const { sorted } = options;
  await db
    .updateTable('conversations')
    .set({
      type_key: sorted.typeKey,
      type_confidence: sorted.typeConfidence,
      type_source: sorted.typeSource,
      type_reason: sorted.typeReason,
      ai_unsure: sorted.aiUnsure,
      needs_person: sorted.needsPerson,
      status: 'sorted',
      sorted_at: sorted.sortedAt,
      updated_by: { kind: sorted.actor.kind, id: sorted.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/** How many conversations of the business there are in all (used by tests and by checks that a business has none yet). */
export async function countConversations(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('conversations')
    .select(sql<string>`count(*)`.as('total'))
    .where('account_id', '=', accountId)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** Links the conversation to the contact (the person on the other end), once the contact is known or made. */
export async function linkContactToConversation(
  db: Db,
  options: { accountId: string; conversationId: string; contactId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ contact_id: options.contactId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/**
 * Fills in the phone and/or the email of the person on the other end, for a chat that did not know them when it began (a web chat). Only an
 * EMPTY value is filled: one that is already there is never replaced, so who the conversation is with can never be swapped afterwards.
 */
export async function fillInVisitorContact(
  db: Db,
  options: {
    accountId: string;
    conversationId: string;
    phoneKey: string | undefined;
    email: string | undefined;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  if (options.phoneKey !== undefined) {
    await db
      .updateTable('conversations')
      .set({ from_phone_key: options.phoneKey, updated_by: actorStamp })
      .where('account_id', '=', options.accountId)
      .where('id', '=', options.conversationId)
      .where('from_phone_key', 'is', null)
      .execute();
  }
  if (options.email !== undefined) {
    await db
      .updateTable('conversations')
      .set({ from_email: options.email, updated_by: actorStamp })
      .where('account_id', '=', options.accountId)
      .where('id', '=', options.conversationId)
      .where('from_email', 'is', null)
      .execute();
  }
}

/** Says that a person must look at the conversation (for example, a lead was wanted but nobody could be identified). */
export async function markConversationNeedsPerson(
  db: Db,
  options: { accountId: string; conversationId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ needs_person: true, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/**
 * A conversation type was removed: its conversations move to another type (the type "unclear"), and a person is asked to look, because the
 * reason for the old type no longer exists. Returns how many conversations moved.
 */
export async function moveConversationsToType(
  db: Db,
  options: { accountId: string; fromTypeKey: string; toTypeKey: string; actor: Actor },
): Promise<number> {
  const result = await db
    .updateTable('conversations')
    .set({
      type_key: options.toTypeKey,
      needs_person: true,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('type_key', '=', options.fromTypeKey)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

/** A person confirmed the type the AI was only fairly sure about: it is no longer "AI unsure", and now a person decided it. */
export async function confirmConversationType(
  db: Db,
  options: { accountId: string; conversationId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ ai_unsure: false, type_source: 'staff', updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/** The columns of a conversation in the Filtered list. */
export interface FilteredConversationRow {
  id: string;
  channel: ConversationChannelWord;
  fromPhoneKey: string | null;
  fromEmail: string | null;
  typeKey: string;
  typeReason: string | null;
  createdAt: Date;
}

/** Turns a Filtered-list query's conditions on: a real (not test), sorted conversation whose current outcome is "filter". */
function selectFilteredConversations(db: Db, accountId: string) {
  return db
    .selectFrom('conversations as conversation')
    .where('conversation.account_id', '=', accountId)
    .where('conversation.is_test', '=', false)
    .where('conversation.status', '=', 'sorted')
    .where('conversation.type_key', 'is not', null)
    .where((condition) =>
      condition.exists(
        condition
          .selectFrom('conversation_outcomes as outcome')
          .select('outcome.id')
          .whereRef('outcome.conversation_id', '=', 'conversation.id')
          .where('outcome.account_id', '=', accountId)
          .where('outcome.kind', '=', 'filter')
          .where('outcome.superseded_at', 'is', null),
      ),
    );
}

/** One page of the conversations that were filtered out, newest first, and how many there are in all. */
export async function listFilteredConversations(
  db: Db,
  options: { accountId: string; limit: number; offset: number },
): Promise<{ rows: FilteredConversationRow[]; total: number }> {
  const rows = await selectFilteredConversations(db, options.accountId)
    .select([
      'conversation.id',
      'conversation.channel',
      'conversation.from_phone_key',
      'conversation.from_email',
      'conversation.type_key',
      'conversation.type_reason',
      'conversation.created_at',
    ])
    .orderBy('conversation.created_at', 'desc')
    .orderBy('conversation.id', 'desc')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  const count = await selectFilteredConversations(db, options.accountId)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return {
    rows: rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      fromPhoneKey: row.from_phone_key,
      fromEmail: row.from_email,
      typeKey: row.type_key as string,
      typeReason: row.type_reason,
      createdAt: row.created_at,
    })),
    total: Number(count.total),
  };
}

/** True when the conversation is a real sorted one whose current outcome is "filter". */
export async function isConversationFiltered(db: Db, accountId: string, conversationId: string): Promise<boolean> {
  const row = await selectFilteredConversations(db, accountId)
    .select('conversation.id')
    .where('conversation.id', '=', conversationId)
    .executeTakeFirst();
  return row !== undefined;
}
