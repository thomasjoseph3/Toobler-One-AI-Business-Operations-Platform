import { sql } from 'kysely';
import type { AiKeyStatus, AiProvider } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `ai_keys` table (the AI keys a business saved). Every query names the business as well as the id (defence in
// depth: the database also fences every query by business). Removed keys (deleted_at set) are left out of every read here.
// The scrambled key is NOT selected by the list reads: only the code that really calls the AI company needs it.

/** A saved key without its secret, as the database holds it. The service turns it into the API's AiKey. */
export interface AiKeyRow {
  id: string;
  provider: AiProvider;
  label: string;
  keyLastFour: string;
  status: AiKeyStatus;
  statusNote: string | null;
  statusCheckedAt: Date | null;
  createdAt: Date;
}

const LIST_COLUMNS = [
  'id',
  'provider',
  'label',
  'key_last_four',
  'status',
  'status_note',
  'status_checked_at',
  'created_at',
] as const;

/** Turns a database row into an AiKeyRow. */
function toAiKeyRow(row: {
  id: string;
  provider: AiProvider;
  label: string;
  key_last_four: string;
  status: AiKeyStatus;
  status_note: string | null;
  status_checked_at: Date | null;
  created_at: Date;
}): AiKeyRow {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyLastFour: row.key_last_four,
    status: row.status,
    statusNote: row.status_note,
    statusCheckedAt: row.status_checked_at,
    createdAt: row.created_at,
  };
}

/** Makes this business's other key changes wait their turn until the end of the transaction (so the limit and duplicate checks hold). */
export async function lockAiKeysOfBusiness(db: Db, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`ai_keys:${accountId}`}))`.execute(db);
}

/** How many live keys the business has for one company. */
export async function countKeysOfProvider(db: Db, accountId: string, provider: AiProvider): Promise<number> {
  const row = await db
    .selectFrom('ai_keys')
    .select((expressionBuilder) => expressionBuilder.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('provider', '=', provider)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The business's live key of this company with this fingerprint (the same key saved already), or undefined. */
export async function findKeyByFingerprint(
  db: Db,
  accountId: string,
  provider: AiProvider,
  fingerprint: string,
): Promise<{ id: string; label: string } | undefined> {
  return db
    .selectFrom('ai_keys')
    .select(['id', 'label'])
    .where('account_id', '=', accountId)
    .where('provider', '=', provider)
    .where('key_fingerprint', '=', fingerprint)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

/** Saves a key (already scrambled). Fails with a unique error when the same key is saved twice. */
export async function insertKey(
  db: Db,
  key: {
    id: string;
    accountId: string;
    provider: AiProvider;
    label: string;
    encryptedKey: string;
    keyLastFour: string;
    keyFingerprint: string;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: key.actor.kind, id: key.actor.id };
  await db
    .insertInto('ai_keys')
    .values({
      id: key.id,
      account_id: key.accountId,
      provider: key.provider,
      label: key.label,
      encrypted_key: key.encryptedKey,
      key_last_four: key.keyLastFour,
      key_fingerprint: key.keyFingerprint,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One live key of the business (without its secret), or undefined when the id is unknown, removed, or another business's. */
export async function findKeyById(db: Db, accountId: string, keyId: string): Promise<AiKeyRow | undefined> {
  const row = await db
    .selectFrom('ai_keys')
    .select(LIST_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', keyId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toAiKeyRow(row) : undefined;
}

/** The business's live keys (without their secrets), oldest first: the order they are tried in. */
export async function listKeys(db: Db, accountId: string): Promise<AiKeyRow[]> {
  const rows = await db
    .selectFrom('ai_keys')
    .select(LIST_COLUMNS)
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(toAiKeyRow);
}

/** What the code needs to call the AI company with a key: its company and its scrambled secret. Never returned by the API. */
export interface AiKeySecretRow {
  id: string;
  provider: AiProvider;
  encryptedKey: string;
}

/** One live key with its scrambled secret, or undefined when the id is unknown, removed, or another business's. */
export async function findKeySecretById(db: Db, accountId: string, keyId: string): Promise<AiKeySecretRow | undefined> {
  const row = await db
    .selectFrom('ai_keys')
    .select(['id', 'provider', 'encrypted_key'])
    .where('account_id', '=', accountId)
    .where('id', '=', keyId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? { id: row.id, provider: row.provider, encryptedKey: row.encrypted_key } : undefined;
}

/**
 * Writes the result of a test: the note and the time, and the new status when the test could tell (null leaves the status as it
 * was). Returns false when the key is gone (removed while the test ran), so the caller can answer 404.
 */
export async function recordKeyTest(
  db: Db,
  options: {
    accountId: string;
    keyId: string;
    status: AiKeyStatus | null;
    note: string;
    checkedAt: Date;
    actor: Actor;
  },
): Promise<boolean> {
  const result = await db
    .updateTable('ai_keys')
    .set({
      ...(options.status !== null ? { status: options.status } : {}),
      status_note: options.note,
      status_checked_at: options.checkedAt,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.keyId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Removes a key: marks it removed and wipes its scrambled secret and fingerprint (the only change the database allows to them), so
 * nothing of the key is left and the same key can be saved again later. Returns false when the key is unknown, already removed, or
 * another business's.
 */
export async function removeKeyAndWipeSecret(
  db: Db,
  options: { accountId: string; keyId: string; actor: Actor; now: Date },
): Promise<boolean> {
  const result = await db
    .updateTable('ai_keys')
    .set({
      deleted_at: options.now,
      encrypted_key: 'v1.removed.removed.removed',
      key_fingerprint: '0'.repeat(64),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.keyId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** A live key with its scrambled secret, for building the list of things to try when the AI is asked. Never returned by the API. */
export interface AiKeyToUseRow {
  id: string;
  provider: AiProvider;
  encryptedKey: string;
  status: AiKeyStatus;
}

/** The business's live keys with their scrambled secrets, oldest first (the order they are tried in). */
export async function listKeysToUse(db: Db, accountId: string): Promise<AiKeyToUseRow[]> {
  const rows = await db
    .selectFrom('ai_keys')
    .select(['id', 'provider', 'encrypted_key', 'status'])
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    encryptedKey: row.encrypted_key,
    status: row.status,
  }));
}

/** Writes what real use showed about a key: its new status, a note and the time. */
export async function updateKeyHealth(
  db: Db,
  options: { accountId: string; keyId: string; status: AiKeyStatus; note: string; checkedAt: Date; actor: Actor },
): Promise<void> {
  await db
    .updateTable('ai_keys')
    .set({
      status: options.status,
      status_note: options.note,
      status_checked_at: options.checkedAt,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.keyId)
    .where('deleted_at', 'is', null)
    .execute();
}

/** A live key with what the daily check needs: its label (for the email), its status and when it last sent a warning. */
export interface AiKeyToCheckRow {
  id: string;
  provider: AiProvider;
  label: string;
  encryptedKey: string;
  status: AiKeyStatus;
  lastNoticeAt: Date | null;
}

/** The business's live keys with their scrambled secrets, for the daily check. Never returned by the API. */
export async function listKeysToCheck(db: Db, accountId: string): Promise<AiKeyToCheckRow[]> {
  const rows = await db
    .selectFrom('ai_keys')
    .select(['id', 'provider', 'label', 'encrypted_key', 'status', 'last_notice_at'])
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    encryptedKey: row.encrypted_key,
    status: row.status,
    lastNoticeAt: row.last_notice_at,
  }));
}

/** Notes the moment a warning email about a key was sent (so one problem sends one email a day). */
export async function noteKeyNoticeSent(
  db: Db,
  options: { accountId: string; keyId: string; sentAt: Date },
): Promise<void> {
  await db
    .updateTable('ai_keys')
    .set({ last_notice_at: options.sentAt })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.keyId)
    .execute();
}
