import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for `whatsapp_connections` (one row per business) and `channel_message_receipts` (WhatsApp message ids already received).
// Every query names the business as well as the row (defence in depth: the database also fences every query by business).
// The encrypted token is selected only by the functions that say so: the screen's read never loads it.

/** A business's connection as the database holds it, without the token. */
export interface WhatsappConnectionRow {
  accountId: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  tokenLastFour: string;
  answerMessages: boolean;
  status: 'unchecked' | 'working' | 'failed';
  statusNote: string | null;
  statusCheckedAt: Date | null;
  lastMessageAt: Date | null;
}

/** Turns a database row into a WhatsappConnectionRow. */
function toConnectionRow(row: {
  account_id: string;
  phone_number_id: string;
  business_account_id: string | null;
  display_phone_number: string | null;
  token_last_four: string;
  answer_messages: boolean;
  status: 'unchecked' | 'working' | 'failed';
  status_note: string | null;
  status_checked_at: Date | null;
  last_message_at: Date | null;
}): WhatsappConnectionRow {
  return {
    accountId: row.account_id,
    phoneNumberId: row.phone_number_id,
    businessAccountId: row.business_account_id,
    displayPhoneNumber: row.display_phone_number,
    tokenLastFour: row.token_last_four,
    answerMessages: row.answer_messages,
    status: row.status,
    statusNote: row.status_note,
    statusCheckedAt: row.status_checked_at,
    lastMessageAt: row.last_message_at,
  };
}

/** The business's connection (without its token), or undefined when none is connected. */
export async function findConnection(db: Db, accountId: string): Promise<WhatsappConnectionRow | undefined> {
  const row = await db
    .selectFrom('whatsapp_connections')
    .select([
      'account_id',
      'phone_number_id',
      'business_account_id',
      'display_phone_number',
      'token_last_four',
      'answer_messages',
      'status',
      'status_note',
      'status_checked_at',
      'last_message_at',
    ])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? toConnectionRow(row) : undefined;
}

/** What sending needs: the number's id and the scrambled token, or undefined when none is connected. */
export async function findAccessForSending(
  db: Db,
  accountId: string,
): Promise<{ phoneNumberId: string; encryptedAccessToken: string } | undefined> {
  const row = await db
    .selectFrom('whatsapp_connections')
    .select(['phone_number_id', 'encrypted_access_token'])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? { phoneNumberId: row.phone_number_id, encryptedAccessToken: row.encrypted_access_token } : undefined;
}

/**
 * Finds the business a customer's message is for, from the number it was sent to. Runs on the system connection (no business is known yet).
 * Answers the business, whether it wants the AI to answer, the business's country for reading numbers, and the scrambled token.
 */
export async function findConnectionByPhoneNumberId(
  systemDb: Db,
  phoneNumberId: string,
): Promise<{ accountId: string; answerMessages: boolean; encryptedAccessToken: string } | undefined> {
  const row = await systemDb
    .selectFrom('whatsapp_connections')
    .select(['account_id', 'answer_messages', 'encrypted_access_token'])
    .where('phone_number_id', '=', phoneNumberId)
    .executeTakeFirst();
  return row
    ? {
        accountId: row.account_id,
        answerMessages: row.answer_messages,
        encryptedAccessToken: row.encrypted_access_token,
      }
    : undefined;
}

/** Whether another business already uses this number id. */
export async function isNumberUsedByAnotherBusiness(
  systemDb: Db,
  phoneNumberId: string,
  accountId: string,
): Promise<boolean> {
  const row = await systemDb
    .selectFrom('whatsapp_connections')
    .select('account_id')
    .where('phone_number_id', '=', phoneNumberId)
    .where('account_id', '!=', accountId)
    .executeTakeFirst();
  return row !== undefined;
}

/** What is stored when a number is connected. */
export interface NewConnection {
  accountId: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  encryptedAccessToken: string;
  tokenLastFour: string;
  answerMessages: boolean;
  actor: Actor;
}

/** Connects a number. */
export async function insertConnection(db: Db, connection: NewConnection): Promise<void> {
  const actorStamp = { kind: connection.actor.kind, id: connection.actor.id };
  await db
    .insertInto('whatsapp_connections')
    .values({
      account_id: connection.accountId,
      phone_number_id: connection.phoneNumberId,
      business_account_id: connection.businessAccountId,
      encrypted_access_token: connection.encryptedAccessToken,
      token_last_four: connection.tokenLastFour,
      answer_messages: connection.answerMessages,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** What may change on a connection. A field left out stays as it is. Changing the number or the token puts the status back to "unchecked". */
export interface ConnectionChanges {
  phoneNumberId?: string;
  businessAccountId?: string | null;
  encryptedAccessToken?: string;
  tokenLastFour?: string;
  answerMessages?: boolean;
}

/** Changes the connection's settings. */
export async function updateConnection(
  db: Db,
  options: { accountId: string; changes: ConnectionChanges; actor: Actor },
): Promise<void> {
  const { changes } = options;
  const numberOrTokenChanged = changes.phoneNumberId !== undefined || changes.encryptedAccessToken !== undefined;
  await db
    .updateTable('whatsapp_connections')
    .set({
      ...(changes.phoneNumberId === undefined ? {} : { phone_number_id: changes.phoneNumberId }),
      ...(changes.businessAccountId === undefined ? {} : { business_account_id: changes.businessAccountId }),
      ...(changes.encryptedAccessToken === undefined ? {} : { encrypted_access_token: changes.encryptedAccessToken }),
      ...(changes.tokenLastFour === undefined ? {} : { token_last_four: changes.tokenLastFour }),
      ...(changes.answerMessages === undefined ? {} : { answer_messages: changes.answerMessages }),
      // A new number or token has not been tested yet
      ...(numberOrTokenChanged
        ? { status: 'unchecked' as const, status_note: null, status_checked_at: null, display_phone_number: null }
        : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Notes the result of a "Check connection" (or of a real send that failed). */
export async function saveCheckResult(
  db: Db,
  options: {
    accountId: string;
    status: 'working' | 'failed';
    note: string;
    displayPhoneNumber: string | null;
    checkedAt: Date;
  },
): Promise<void> {
  await db
    .updateTable('whatsapp_connections')
    .set({
      status: options.status,
      status_note: options.note.slice(0, 300),
      status_checked_at: options.checkedAt,
      // A failed check keeps the number we knew
      ...(options.displayPhoneNumber === null ? {} : { display_phone_number: options.displayPhoneNumber }),
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Notes that a customer's message has just arrived. */
export async function noteMessageArrived(db: Db, accountId: string, arrivedAt: Date): Promise<void> {
  await db
    .updateTable('whatsapp_connections')
    .set({ last_message_at: arrivedAt })
    .where('account_id', '=', accountId)
    .execute();
}

/** Removes the connection (and with it the scrambled token). Answers true when there was one. */
export async function deleteConnection(db: Db, accountId: string): Promise<boolean> {
  const result = await db.deleteFrom('whatsapp_connections').where('account_id', '=', accountId).executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/**
 * Writes down that a WhatsApp message id has been received. Answers true for the first time, false when it was already there (a repeated
 * delivery): only the first is answered.
 */
export async function claimMessageId(db: Db, accountId: string, messageId: string): Promise<boolean> {
  const result = await db
    .insertInto('channel_message_receipts')
    .values({ account_id: accountId, channel: 'whatsapp', external_id: messageId })
    .onConflict((conflict) => conflict.columns(['account_id', 'channel', 'external_id']).doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** Forgets the receipts older than `before` (a week is far longer than Meta retries). Answers how many were removed. */
export async function deleteReceiptsOlderThan(db: Db, accountId: string, before: Date): Promise<number> {
  const result = await db
    .deleteFrom('channel_message_receipts')
    .where('account_id', '=', accountId)
    .where('channel', '=', 'whatsapp')
    .where('received_at', '<', before)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
