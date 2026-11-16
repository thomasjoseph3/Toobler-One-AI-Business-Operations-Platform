import type { Db } from '../../../../kernel/database';

// The SQL for the `classification_corrections` table: each time a person changed a conversation's type. Written once, never edited.

/** Notes that a person changed a conversation's type, from what, to what. */
export async function insertCorrection(
  db: Db,
  correction: {
    id: string;
    accountId: string;
    conversationId: string;
    fromTypeKey: string;
    toTypeKey: string;
    byUserId: string;
  },
): Promise<void> {
  await db
    .insertInto('classification_corrections')
    .values({
      id: correction.id,
      account_id: correction.accountId,
      conversation_id: correction.conversationId,
      from_type_key: correction.fromTypeKey,
      to_type_key: correction.toTypeKey,
      by_user_id: correction.byUserId,
    })
    .execute();
}
