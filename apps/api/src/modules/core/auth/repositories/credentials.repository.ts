import type { Db } from '../../../../kernel/database';

// The SQL for the `user_credentials` table (password hashes). This table is closed to the normal app role: only the owner
// connection can reach it, and only through the functions in this file.

/** Stores a person's password hash (never the password itself). */
export async function insertCredentials(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.insertInto('user_credentials').values({ user_id: userId, password_hash: passwordHash }).execute();
}

/** ACROSS BUSINESSES (runs on the owner connection). The stored password hash of a person, or undefined. */
export async function findPasswordHash(db: Db, userId: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('user_credentials')
    .select('password_hash')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row?.password_hash;
}

/** Replaces a person's password hash with a new one (never the password itself). */
export async function setPasswordHash(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.updateTable('user_credentials').set({ password_hash: passwordHash }).where('user_id', '=', userId).execute();
}
