import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';
import type { LlmProviderId } from '../../../../providers/llm';

// The SQL the daily AI check needs that works across businesses or on platform-level tables. It runs on the owner connection, only
// from the nightly jobs. Nothing here returns a key or any message text.

/** A person who should get a warning email. */
export interface PersonToWarn {
  name: string;
  email: string;
}

/** The platform team: the active people marked as platform admins. */
export async function findPlatformAdmins(db: Db): Promise<PersonToWarn[]> {
  return db
    .selectFrom('users')
    .select(['name', 'email'])
    .where('is_platform_admin', '=', true)
    .where('status', '=', 'active')
    .orderBy('email')
    .execute();
}

/** A business's managers: the active people with the manager role. */
export async function findManagersOf(db: Db, accountId: string): Promise<PersonToWarn[]> {
  return db
    .selectFrom('users')
    .select(['name', 'email'])
    .where('account_id', '=', accountId)
    .where('role', '=', 'manager')
    .where('status', '=', 'active')
    .orderBy('email')
    .execute();
}

/** Writes what the check found about one platform key (by position, never the key). */
export async function savePlatformKeyCheck(
  db: Db,
  check: {
    provider: LlmProviderId;
    keyPosition: number;
    status: 'working' | 'limited' | 'failed';
    note: string;
    checkedAt: Date;
  },
): Promise<void> {
  await db
    .insertInto('ai_platform_key_checks')
    .values({
      provider: check.provider,
      key_position: check.keyPosition,
      status: check.status,
      status_note: check.note,
      checked_at: check.checkedAt,
    })
    .onConflict((conflict) =>
      conflict.columns(['provider', 'key_position']).doUpdateSet({
        status: check.status,
        status_note: check.note,
        checked_at: check.checkedAt,
      }),
    )
    .execute();
}

/** When a warning with this key was last sent, or undefined if never. */
export async function findNoticeSentAt(db: Db, noticeKey: string): Promise<Date | undefined> {
  const row = await db
    .selectFrom('ai_notices_sent')
    .select('sent_at')
    .where('notice_key', '=', noticeKey)
    .executeTakeFirst();
  return row?.sent_at;
}

/** Notes that a warning with this key has just been sent. */
export async function noteNoticeSent(db: Db, noticeKey: string, sentAt: Date): Promise<void> {
  await db
    .insertInto('ai_notices_sent')
    .values({ notice_key: noticeKey, sent_at: sentAt })
    .onConflict((conflict) => conflict.column('notice_key').doUpdateSet({ sent_at: sentAt }))
    .execute();
}

/** A job that needed a fallback many times lately, for one business, on one kind of key. */
export interface FallbackStorm {
  accountId: string;
  task: string;
  keySource: 'platform' | 'own';
  count: number;
}

/** Jobs that needed a fallback at least `minimum` times since this moment, across all businesses. */
export async function findFallbackStorms(db: Db, options: { since: Date; minimum: number }): Promise<FallbackStorm[]> {
  const rows = await db
    .selectFrom('ai_calls')
    .select(['account_id', 'task', 'key_source', sql<string>`count(*)`.as('total')])
    .where('fallback_used', '=', true)
    .where('created_at', '>=', options.since)
    .groupBy(['account_id', 'task', 'key_source'])
    .having(sql`count(*)`, '>=', options.minimum)
    .execute();
  return rows.map((row) => ({
    accountId: row.account_id,
    task: row.task,
    keySource: row.key_source,
    count: Number(row.total),
  }));
}

/** Deletes call records older than this moment (the daily totals are kept). Returns how many were deleted. */
export async function deleteCallsOlderThan(db: Db, cutoff: Date): Promise<number> {
  const result = await db.deleteFrom('ai_calls').where('created_at', '<', cutoff).executeTakeFirst();
  return Number(result.numDeletedRows);
}
