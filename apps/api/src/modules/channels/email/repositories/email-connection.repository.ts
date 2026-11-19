import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for `email_connections` (one row per business) and `email_drafts`. Every query names the business as well as the row (defence in
// depth: the database also fences every query by business). The encrypted password is selected only by the function that says so.

/** A business's connection as the database holds it, without the password. */
export interface EmailConnectionRow {
  accountId: string;
  address: string;
  username: string;
  passwordLastFour: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  replyMode: 'send' | 'draft';
  readEmails: boolean;
  checkedUpTo: Date;
  status: 'unchecked' | 'working' | 'failed';
  statusNote: string | null;
  statusCheckedAt: Date | null;
  lastEmailAt: Date | null;
}

const CONNECTION_COLUMNS = [
  'account_id',
  'address',
  'username',
  'password_last_four',
  'imap_host',
  'imap_port',
  'smtp_host',
  'smtp_port',
  'reply_mode',
  'read_emails',
  'checked_up_to',
  'status',
  'status_note',
  'status_checked_at',
  'last_email_at',
] as const;

/** Turns a database row into an EmailConnectionRow. */
function toConnectionRow(row: {
  account_id: string;
  address: string;
  username: string;
  password_last_four: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  reply_mode: 'send' | 'draft';
  read_emails: boolean;
  checked_up_to: Date;
  status: 'unchecked' | 'working' | 'failed';
  status_note: string | null;
  status_checked_at: Date | null;
  last_email_at: Date | null;
}): EmailConnectionRow {
  return {
    accountId: row.account_id,
    address: row.address,
    username: row.username,
    passwordLastFour: row.password_last_four,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    replyMode: row.reply_mode,
    readEmails: row.read_emails,
    checkedUpTo: row.checked_up_to,
    status: row.status,
    statusNote: row.status_note,
    statusCheckedAt: row.status_checked_at,
    lastEmailAt: row.last_email_at,
  };
}

/** The business's connection (without its password), or undefined when none is connected. */
export async function findConnection(db: Db, accountId: string): Promise<EmailConnectionRow | undefined> {
  const row = await db
    .selectFrom('email_connections')
    .select([...CONNECTION_COLUMNS])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? toConnectionRow(row) : undefined;
}

/** The connection together with its scrambled password: only for code that really signs in to the mailbox. */
export async function findConnectionWithPassword(
  db: Db,
  accountId: string,
): Promise<(EmailConnectionRow & { encryptedPassword: string }) | undefined> {
  const row = await db
    .selectFrom('email_connections')
    .select([...CONNECTION_COLUMNS, 'encrypted_password'])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? { ...toConnectionRow(row), encryptedPassword: row.encrypted_password } : undefined;
}

/** The ids of the businesses whose mailbox should be read now (connected, reading on). Runs on the system connection: it names no business yet. */
export async function listAccountIdsToRead(systemDb: Db): Promise<string[]> {
  const rows = await systemDb
    .selectFrom('email_connections')
    .select('account_id')
    .where('read_emails', '=', true)
    .execute();
  return rows.map((row) => row.account_id);
}

/** What is stored when a mailbox is connected. */
export interface NewEmailConnection {
  accountId: string;
  address: string;
  username: string;
  encryptedPassword: string;
  passwordLastFour: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  replyMode: 'send' | 'draft';
  readEmails: boolean;
  actor: Actor;
}

/** Connects a mailbox. */
export async function insertConnection(db: Db, connection: NewEmailConnection): Promise<void> {
  const actorStamp = { kind: connection.actor.kind, id: connection.actor.id };
  await db
    .insertInto('email_connections')
    .values({
      account_id: connection.accountId,
      address: connection.address,
      username: connection.username,
      encrypted_password: connection.encryptedPassword,
      password_last_four: connection.passwordLastFour,
      imap_host: connection.imapHost,
      imap_port: connection.imapPort,
      smtp_host: connection.smtpHost,
      smtp_port: connection.smtpPort,
      reply_mode: connection.replyMode,
      read_emails: connection.readEmails,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** What may change on a connection. A field left out stays as it is. Changing the login puts the status back to "unchecked". */
export interface EmailConnectionChanges {
  address?: string;
  username?: string;
  encryptedPassword?: string;
  passwordLastFour?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  replyMode?: 'send' | 'draft';
  readEmails?: boolean;
}

/** Changes the connection's settings. */
export async function updateConnection(
  db: Db,
  options: { accountId: string; changes: EmailConnectionChanges; actor: Actor },
): Promise<void> {
  const { changes } = options;
  const loginChanged =
    changes.address !== undefined ||
    changes.username !== undefined ||
    changes.encryptedPassword !== undefined ||
    changes.imapHost !== undefined ||
    changes.imapPort !== undefined ||
    changes.smtpHost !== undefined ||
    changes.smtpPort !== undefined;
  await db
    .updateTable('email_connections')
    .set({
      ...(changes.address === undefined ? {} : { address: changes.address }),
      ...(changes.username === undefined ? {} : { username: changes.username }),
      ...(changes.encryptedPassword === undefined ? {} : { encrypted_password: changes.encryptedPassword }),
      ...(changes.passwordLastFour === undefined ? {} : { password_last_four: changes.passwordLastFour }),
      ...(changes.imapHost === undefined ? {} : { imap_host: changes.imapHost }),
      ...(changes.imapPort === undefined ? {} : { imap_port: changes.imapPort }),
      ...(changes.smtpHost === undefined ? {} : { smtp_host: changes.smtpHost }),
      ...(changes.smtpPort === undefined ? {} : { smtp_port: changes.smtpPort }),
      ...(changes.replyMode === undefined ? {} : { reply_mode: changes.replyMode }),
      ...(changes.readEmails === undefined ? {} : { read_emails: changes.readEmails }),
      ...(loginChanged ? { status: 'unchecked' as const, status_note: null, status_checked_at: null } : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Notes the result of a check, or of a read or send that failed. */
export async function saveCheckResult(
  db: Db,
  options: { accountId: string; status: 'working' | 'failed'; note: string; checkedAt: Date },
): Promise<void> {
  await db
    .updateTable('email_connections')
    .set({ status: options.status, status_note: options.note.slice(0, 300), status_checked_at: options.checkedAt })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Notes that the mailbox was read up to a moment (so the next read starts there), and when the newest email arrived. */
export async function saveReadProgress(
  db: Db,
  options: { accountId: string; checkedUpTo: Date; lastEmailAt: Date | null },
): Promise<void> {
  await db
    .updateTable('email_connections')
    .set({
      checked_up_to: options.checkedUpTo,
      ...(options.lastEmailAt === null ? {} : { last_email_at: options.lastEmailAt }),
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Removes the connection (and with it the scrambled password). Answers true when there was one. */
export async function deleteConnection(db: Db, accountId: string): Promise<boolean> {
  const result = await db.deleteFrom('email_connections').where('account_id', '=', accountId).executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/**
 * Writes down that an email id has been received. Answers true the first time, false when it was already there (read twice): only the first
 * is answered. Shares the table with WhatsApp, told apart by the channel.
 */
export async function claimEmailId(db: Db, accountId: string, messageId: string): Promise<boolean> {
  const result = await db
    .insertInto('channel_message_receipts')
    .values({ account_id: accountId, channel: 'email', external_id: messageId.slice(0, 300) })
    .onConflict((conflict) => conflict.columns(['account_id', 'channel', 'external_id']).doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** Forgets that one email id was received, so the next reading tries that email again (used when it could not be answered). */
export async function forgetEmailId(db: Db, accountId: string, messageId: string): Promise<void> {
  await db
    .deleteFrom('channel_message_receipts')
    .where('account_id', '=', accountId)
    .where('channel', '=', 'email')
    .where('external_id', '=', messageId.slice(0, 300))
    .execute();
}

/** Forgets the email receipts older than `before`. Answers how many were removed. */
export async function deleteEmailReceiptsOlderThan(db: Db, accountId: string, before: Date): Promise<number> {
  const result = await db
    .deleteFrom('channel_message_receipts')
    .where('account_id', '=', accountId)
    .where('channel', '=', 'email')
    .where('received_at', '<', before)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** A draft as the database holds it. */
export interface EmailDraftRow {
  id: string;
  conversationId: string;
  toEmail: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string[];
  status: 'waiting' | 'sent' | 'discarded';
  createdAt: Date;
}

/** Turns a database row into an EmailDraftRow. */
function toDraftRow(row: {
  id: string;
  conversation_id: string;
  to_email: string;
  subject: string;
  body: string;
  in_reply_to: string | null;
  thread_references: string[];
  status: 'waiting' | 'sent' | 'discarded';
  created_at: Date;
}): EmailDraftRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    toEmail: row.to_email,
    subject: row.subject,
    body: row.body,
    inReplyTo: row.in_reply_to,
    references: row.thread_references,
    status: row.status,
    createdAt: row.created_at,
  };
}

const DRAFT_COLUMNS = [
  'id',
  'conversation_id',
  'to_email',
  'subject',
  'body',
  'in_reply_to',
  'thread_references',
  'status',
  'created_at',
] as const;

/** Saves a reply for a team member to approve. */
export async function insertDraft(
  db: Db,
  draft: {
    id: string;
    accountId: string;
    conversationId: string;
    toEmail: string;
    subject: string;
    body: string;
    inReplyTo: string | null;
    references: string[];
  },
): Promise<void> {
  await db
    .insertInto('email_drafts')
    .values({
      id: draft.id,
      account_id: draft.accountId,
      conversation_id: draft.conversationId,
      to_email: draft.toEmail,
      subject: draft.subject.slice(0, 300),
      body: draft.body,
      in_reply_to: draft.inReplyTo,
      thread_references: JSON.stringify(draft.references),
    })
    .execute();
}

/** The drafts waiting for a team member, oldest first. */
export async function listWaitingDrafts(db: Db, accountId: string): Promise<EmailDraftRow[]> {
  const rows = await db
    .selectFrom('email_drafts')
    .select([...DRAFT_COLUMNS])
    .where('account_id', '=', accountId)
    .where('status', '=', 'waiting')
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(toDraftRow);
}

/** One draft of the business (any status), or undefined when the id is unknown or another business's. */
export async function findDraft(db: Db, accountId: string, draftId: string): Promise<EmailDraftRow | undefined> {
  const row = await db
    .selectFrom('email_drafts')
    .select([...DRAFT_COLUMNS])
    .where('account_id', '=', accountId)
    .where('id', '=', draftId)
    .executeTakeFirst();
  return row ? toDraftRow(row) : undefined;
}

/**
 * Settles a waiting draft as sent or discarded, once: answers false when it was no longer waiting (a second click, or someone else was first),
 * so a draft is never sent twice. `body` is the words that went out (the team member may have changed them).
 */
export async function settleDraft(
  db: Db,
  options: { accountId: string; draftId: string; status: 'sent' | 'discarded'; body?: string; actor: Actor },
): Promise<boolean> {
  const result = await db
    .updateTable('email_drafts')
    .set({
      status: options.status,
      decided_at: new Date(),
      decided_by: { kind: options.actor.kind, id: options.actor.id },
      ...(options.body === undefined ? {} : { body: options.body }),
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.draftId)
    .where('status', '=', 'waiting')
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Puts a draft that was being sent back to waiting (the send failed), so it can be tried again. */
export async function reopenDraft(db: Db, accountId: string, draftId: string): Promise<void> {
  await db
    .updateTable('email_drafts')
    .set({ status: 'waiting', decided_at: null, decided_by: null })
    .where('account_id', '=', accountId)
    .where('id', '=', draftId)
    .where('status', '=', 'sent')
    .execute();
}
