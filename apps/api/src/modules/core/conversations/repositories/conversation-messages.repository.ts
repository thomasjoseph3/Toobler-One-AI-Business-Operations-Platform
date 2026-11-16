import type { Db } from '../../../../kernel/database';

// The SQL for the `conversation_messages` table. A message is written once and never changed or deleted.

export type MessageSender = 'customer' | 'agent' | 'staff' | 'system';

/** A message as the database holds it. */
export interface ConversationMessageRow {
  id: string;
  sender: MessageSender;
  body: string;
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
    .select(['id', 'sender', 'body', 'created_at'])
    .where('account_id', '=', accountId)
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({ id: row.id, sender: row.sender, body: row.body, createdAt: row.created_at }));
}
