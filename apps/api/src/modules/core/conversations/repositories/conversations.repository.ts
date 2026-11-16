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
