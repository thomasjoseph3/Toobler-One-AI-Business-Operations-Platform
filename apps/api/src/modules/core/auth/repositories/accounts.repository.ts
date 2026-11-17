import type { Db } from '../../../../kernel/database';

// The SQL for the `accounts` table (the business itself). Like every file in this folder it is a repository: the only kind
// of file that talks to the database. Features call it through their service; routes never touch it.

/** Adds a business. */
export async function insertAccount(db: Db, account: { id: string; name: string; industry: string }): Promise<void> {
  await db.insertInto('accounts').values(account).execute();
}

/** A business as the profile shows it. */
export interface AccountSummary {
  id: string;
  name: string;
  industry: string;
  timeZone: string;
  callbackPromiseMinutes: number;
}

/** A business by id, or undefined. (Run on the owner connection when no business is signed in yet.) */
export async function findAccountById(db: Db, accountId: string): Promise<AccountSummary | undefined> {
  const row = await db
    .selectFrom('accounts')
    .select(['id', 'name', 'industry', 'time_zone', 'callback_promise_minutes'])
    .where('id', '=', accountId)
    .executeTakeFirst();
  return row
    ? {
        id: row.id,
        name: row.name,
        industry: row.industry,
        timeZone: row.time_zone,
        callbackPromiseMinutes: row.callback_promise_minutes,
      }
    : undefined;
}

/** When the business went live, or null when it has not yet. Undefined when there is no such business. */
export async function findLiveAt(db: Db, accountId: string): Promise<Date | null | undefined> {
  const row = await db.selectFrom('accounts').select('live_at').where('id', '=', accountId).executeTakeFirst();
  return row ? row.live_at : undefined;
}

/**
 * Marks the business live, once. Returns the moment, or null when it was already live (nothing changes then: the first moment is kept).
 */
export async function markLive(
  db: Db,
  accountId: string,
  actor: { kind: string; id: string | null },
): Promise<Date | null> {
  const row = await db
    .updateTable('accounts')
    .set({ live_at: new Date(), live_by: { kind: actor.kind, id: actor.id } })
    .where('id', '=', accountId)
    .where('live_at', 'is', null)
    .returning('live_at')
    .executeTakeFirst();
  return row?.live_at ?? null;
}

/** The business's settings that other modules may read and change through the auth module's index.ts. */
export interface AccountSettings {
  timeZone: string;
  defaultCountry: string;
  /** How many minutes the business promises to call back within while it is open. */
  callbackPromiseMinutes: number;
}

/** The business's settings, or undefined when there is no such business. */
export async function findAccountSettings(db: Db, accountId: string): Promise<AccountSettings | undefined> {
  const row = await db
    .selectFrom('accounts')
    .select(['time_zone', 'default_country', 'callback_promise_minutes'])
    .where('id', '=', accountId)
    .executeTakeFirst();
  return row
    ? {
        timeZone: row.time_zone,
        defaultCountry: row.default_country,
        callbackPromiseMinutes: row.callback_promise_minutes,
      }
    : undefined;
}

/** Changes the settings named in `changes`; a setting left out is not touched. */
export async function updateAccountSettings(
  db: Db,
  accountId: string,
  changes: { timeZone?: string; defaultCountry?: string; callbackPromiseMinutes?: number },
): Promise<void> {
  await db
    .updateTable('accounts')
    .set({
      ...(changes.timeZone !== undefined ? { time_zone: changes.timeZone } : {}),
      ...(changes.defaultCountry !== undefined ? { default_country: changes.defaultCountry } : {}),
      ...(changes.callbackPromiseMinutes !== undefined
        ? { callback_promise_minutes: changes.callbackPromiseMinutes }
        : {}),
    })
    .where('id', '=', accountId)
    .execute();
}
