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
  /** The person holding the conversation and until when (F21). The caller decides whether a hold that ran out still counts. */
  heldByUserId: string | null;
  heldUntil: Date | null;
  /** When staff marked it done, or null. */
  doneAt: Date | null;
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
    heldByUserId: row.held_by_user_id,
    heldUntil: row.held_until,
    doneAt: row.done_at,
    createdAt: row.created_at,
  };
}

/** Whether the conversation is held by a person at this moment: someone holds it and the hold has not run out. */
export function isHeldNow(conversation: Pick<ConversationRow, 'heldByUserId' | 'heldUntil'>, now: Date): boolean {
  return (
    conversation.heldByUserId !== null &&
    conversation.heldUntil !== null &&
    conversation.heldUntil.getTime() > now.getTime()
  );
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
): Promise<boolean> {
  // Ending a conversation also ends any hold on it: nobody can reply to an ended conversation
  const rows = await db
    .updateTable('conversations')
    .set({
      ended_at: options.endedAt,
      held_by_user_id: null,
      held_until: null,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .where('ended_at', 'is', null)
    .returning('id')
    .execute();
  return rows.length > 0;
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

/**
 * The customer's open conversation on a channel (not ended, not a test chat): the newest one for that phone number, or undefined when
 * there is none. A WhatsApp message carries on this conversation; with none, it starts a new one.
 */
export async function findOpenConversationOfPhone(
  db: Db,
  options: { accountId: string; channel: ConversationChannelWord; phoneKey: string },
): Promise<string | undefined> {
  const row = await db
    .selectFrom('conversations')
    .select('id')
    .where('account_id', '=', options.accountId)
    .where('channel', '=', options.channel)
    .where('from_phone_key', '=', options.phoneKey)
    .where('is_test', '=', false)
    .where('ended_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.id;
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

/** Moves every conversation of one contact to another contact (the merge of two contacts). Returns how many rows moved. */
export async function moveConversationsToContact(
  db: Db,
  options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
): Promise<number> {
  const rows = await db
    .updateTable('conversations')
    .set({ contact_id: options.toContactId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('contact_id', '=', options.fromContactId)
    .returning('id')
    .execute();
  return rows.length;
}

// ---- The inbox, staff takeover and done (F21) ----

/** A person takes the conversation over (or extends their hold) until the given time. */
export async function holdConversation(
  db: Db,
  options: { accountId: string; conversationId: string; userId: string; until: Date; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({
      held_by_user_id: options.userId,
      held_until: options.until,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/** Ends a hold (hand back, done, ended, or run out). */
export async function releaseConversationHold(
  db: Db,
  options: { accountId: string; conversationId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ held_by_user_id: null, held_until: null, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/** Marks the conversation done (at the given time) or reopens it (null). */
export async function setConversationDoneAt(
  db: Db,
  options: { accountId: string; conversationId: string; doneAt: Date | null; actor: Actor },
): Promise<void> {
  await db
    .updateTable('conversations')
    .set({ done_at: options.doneAt, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.conversationId)
    .execute();
}

/** The businesses that have a hold that has run out (ids only), for the scheduled clean-up that has no business of its own. */
export async function listAccountIdsWithExpiredHolds(systemDb: Db, now: Date): Promise<string[]> {
  const rows = await systemDb
    .selectFrom('conversations')
    .select('account_id')
    .distinct()
    .where('held_by_user_id', 'is not', null)
    .where('held_until', '<=', now)
    .execute();
  return rows.map((row) => row.account_id);
}

/** Clears every hold of the business that has run out, and answers the conversations that went back to the AI. */
export async function releaseExpiredHolds(
  db: Db,
  options: { accountId: string; now: Date; actor: Actor },
): Promise<string[]> {
  const rows = await db
    .updateTable('conversations')
    .set({ held_by_user_id: null, held_until: null, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('held_by_user_id', 'is not', null)
    .where('held_until', '<=', options.now)
    .returning('id')
    .execute();
  return rows.map((row) => row.id);
}

/** One row of the inbox as the database gives it. */
export interface InboxRow {
  id: string;
  channel: ConversationChannelWord;
  contactId: string | null;
  fromPhoneKey: string | null;
  fromEmail: string | null;
  typeKey: string | null;
  aiUnsure: boolean;
  needsPerson: boolean;
  heldByUserId: string | null;
  heldUntil: Date | null;
  doneAt: Date | null;
  endedAt: Date | null;
  summary: string | null;
  firstWords: string | null;
  lastActivityAt: Date;
  createdAt: Date;
}

/** What the inbox can be narrowed by. */
export interface InboxFilters {
  channel?: ConversationChannelWord | undefined;
  status?: 'open' | 'done' | undefined;
  held?: 'me' | 'any' | undefined;
  needsPerson?: boolean | undefined;
  /** The person asking, for `held=me`. */
  userId: string;
  now: Date;
}

/** The real conversations an inbox lists: not test chats, and not the ones the rules filtered out or ignored (they have their own tab). */
function selectInboxConversations(db: Db, accountId: string, filters: InboxFilters) {
  let query = db
    .selectFrom('conversations as conversation')
    .where('conversation.account_id', '=', accountId)
    .where('conversation.is_test', '=', false)
    .where((condition) =>
      condition.not(
        condition.exists(
          condition
            .selectFrom('conversation_outcomes as outcome')
            .select('outcome.id')
            .whereRef('outcome.conversation_id', '=', 'conversation.id')
            .where('outcome.account_id', '=', accountId)
            .where('outcome.kind', 'in', ['filter', 'ignore'])
            .where('outcome.superseded_at', 'is', null),
        ),
      ),
    );
  if (filters.channel) query = query.where('conversation.channel', '=', filters.channel);
  if (filters.status === 'open') query = query.where('conversation.done_at', 'is', null);
  if (filters.status === 'done') query = query.where('conversation.done_at', 'is not', null);
  if (filters.needsPerson) query = query.where('conversation.needs_person', '=', true);
  if (filters.held) query = query.where('conversation.held_until', '>', filters.now);
  if (filters.held === 'me') query = query.where('conversation.held_by_user_id', '=', filters.userId);
  return query;
}

/** One page of the inbox: needs-a-person first, then the newest activity first; and how many there are in all. */
export async function listInbox(
  db: Db,
  options: { accountId: string; filters: InboxFilters; limit: number; offset: number },
): Promise<{ rows: InboxRow[]; total: number }> {
  const { accountId } = options;
  const lastMessageAt = sql<Date | null>`(select max(message.created_at) from conversation_messages as message where message.account_id = conversation.account_id and message.conversation_id = conversation.id)`;
  const firstWords = sql<
    string | null
  >`(select left(message.body, 160) from conversation_messages as message where message.account_id = conversation.account_id and message.conversation_id = conversation.id and message.sender = 'customer' order by message.created_at, message.id limit 1)`;
  const summary = sql<
    string | null
  >`(select facts.summary from conversation_facts as facts where facts.account_id = conversation.account_id and facts.conversation_id = conversation.id)`;
  const lastActivity = sql<Date>`coalesce(${lastMessageAt}, conversation.created_at)`;
  const rows = await selectInboxConversations(db, accountId, options.filters)
    .select([
      'conversation.id',
      'conversation.channel',
      'conversation.contact_id',
      'conversation.from_phone_key',
      'conversation.from_email',
      'conversation.type_key',
      'conversation.ai_unsure',
      'conversation.needs_person',
      'conversation.held_by_user_id',
      'conversation.held_until',
      'conversation.done_at',
      'conversation.ended_at',
      'conversation.created_at',
      summary.as('summary'),
      firstWords.as('first_words'),
      lastActivity.as('last_activity_at'),
    ])
    .orderBy('conversation.needs_person', 'desc')
    .orderBy(lastActivity, 'desc')
    .orderBy('conversation.id', 'desc')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  const count = await selectInboxConversations(db, accountId, options.filters)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return {
    rows: rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      contactId: row.contact_id,
      fromPhoneKey: row.from_phone_key,
      fromEmail: row.from_email,
      typeKey: row.type_key,
      aiUnsure: row.ai_unsure,
      needsPerson: row.needs_person,
      heldByUserId: row.held_by_user_id,
      heldUntil: row.held_until,
      doneAt: row.done_at,
      endedAt: row.ended_at,
      summary: row.summary,
      firstWords: row.first_words,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
    })),
    total: Number(count.total),
  };
}
