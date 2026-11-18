import type { Db } from '../../../../kernel/database';

// The SQL for the `conversation_messages` table. A message is written once and never changed or deleted.

export type MessageSender = 'customer' | 'agent' | 'staff' | 'system';

/** A message as the database holds it. */
export interface ConversationMessageRow {
  id: string;
  sender: MessageSender;
  body: string;
  /** The person who wrote a staff message. */
  byUserId: string | null;
  createdAt: Date;
}

/**
 * Adds a message. When the channel's own id for it was already stored for this conversation, nothing is added and false comes back (so
 * the same message arriving twice is kept once). Returns true when the message was added.
 */
export async function insertMessageIfNew(
  db: Db,
  message: {
    id: string;
    accountId: string;
    conversationId: string;
    sender: MessageSender;
    body: string;
    channelMessageId: string | null;
    /** The person who wrote it, for a staff message. */
    byUserId?: string | null;
    /** When it was written. Left out, the database uses the start of the transaction. */
    createdAt?: Date;
  },
): Promise<boolean> {
  const result = await db
    .insertInto('conversation_messages')
    .values({
      id: message.id,
      account_id: message.accountId,
      conversation_id: message.conversationId,
      sender: message.sender,
      body: message.body,
      channel_message_id: message.channelMessageId,
      by_user_id: message.byUserId ?? null,
      ...(message.createdAt ? { created_at: message.createdAt } : {}),
    })
    .onConflict((conflict) => conflict.doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** All the messages of a conversation, oldest first (then by id so the order never wobbles). */
export async function listMessagesOfConversation(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationMessageRow[]> {
  const rows = await db
    .selectFrom('conversation_messages')
    .select(['id', 'sender', 'body', 'by_user_id', 'created_at'])
    .where('account_id', '=', accountId)
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    body: row.body,
    byUserId: row.by_user_id,
    createdAt: row.created_at,
  }));
}

/** True when the business has a "Test the agent" chat in which the agent has answered at least once. */
export async function hasTestChatWithAgentReply(db: Db, accountId: string): Promise<boolean> {
  const row = await db
    .selectFrom('conversation_messages')
    .innerJoin('conversations', 'conversations.id', 'conversation_messages.conversation_id')
    .select('conversation_messages.id')
    .where('conversation_messages.account_id', '=', accountId)
    .where('conversations.account_id', '=', accountId)
    .where('conversations.is_test', '=', true)
    .where('conversation_messages.sender', '=', 'agent')
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/** The start of each conversation's first customer message (up to `maxCharacters`), by conversation id. A conversation with none is left out. */
export async function findFirstCustomerWords(
  db: Db,
  options: { accountId: string; conversationIds: string[]; maxCharacters: number },
): Promise<Map<string, string>> {
  if (options.conversationIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('conversation_messages')
    .select(['conversation_id', 'body'])
    .distinctOn('conversation_id')
    .where('account_id', '=', options.accountId)
    .where('conversation_id', 'in', options.conversationIds)
    .where('sender', '=', 'customer')
    .orderBy('conversation_id')
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return new Map(rows.map((row) => [row.conversation_id, row.body.trim().slice(0, options.maxCharacters)]));
}
