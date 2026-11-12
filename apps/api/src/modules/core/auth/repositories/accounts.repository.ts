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
}

/** A business by id, or undefined. (Run on the owner connection when no business is signed in yet.) */
export async function findAccountById(db: Db, accountId: string): Promise<AccountSummary | undefined> {
  const row = await db
    .selectFrom('accounts')
    .select(['id', 'name', 'industry', 'time_zone'])
    .where('id', '=', accountId)
    .executeTakeFirst();
  return row ? { id: row.id, name: row.name, industry: row.industry, timeZone: row.time_zone } : undefined;
}

/** The business's settings that other modules may read and change through the auth module's index.ts. */
export interface AccountSettings {
  timeZone: string;
  defaultCountry: string;
}

/** The business's settings, or undefined when there is no such business. */
export async function findAccountSettings(db: Db, accountId: string): Promise<AccountSettings | undefined> {
  const row = await db
    .selectFrom('accounts')
    .select(['time_zone', 'default_country'])
    .where('id', '=', accountId)
    .executeTakeFirst();
  return row ? { timeZone: row.time_zone, defaultCountry: row.default_country } : undefined;
}

/** Changes the settings named in `changes`; a setting left out is not touched. */
export async function updateAccountSettings(
  db: Db,
  accountId: string,
  changes: { timeZone?: string; defaultCountry?: string },
): Promise<void> {
  await db
    .updateTable('accounts')
    .set({
      ...(changes.timeZone !== undefined ? { time_zone: changes.timeZone } : {}),
      ...(changes.defaultCountry !== undefined ? { default_country: changes.defaultCountry } : {}),
    })
    .where('id', '=', accountId)
    .execute();
}
