import type { Db } from '../../../../kernel/database';

// The SQL for the `accounts` table (the business itself). Like every file in this folder it is a repository: the only kind
// of file that talks to the database. Features call it through their service; routes never touch it.

/** Adds a business. */
export async function insertAccount(db: Db, account: { id: string; name: string; industry: string }): Promise<void> {
  await db.insertInto('accounts').values(account).execute();
}
