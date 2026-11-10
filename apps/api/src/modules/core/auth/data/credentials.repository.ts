import type { Db } from '../../../../kernel/database';

// The SQL for the `user_credentials` table (password hashes). This table is closed to the normal app role: only the owner
// connection can reach it, and only through the functions in this file.

/** Stores a person's password hash (never the password itself). */
export async function insertCredentials(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.insertInto('user_credentials').values({ user_id: userId, password_hash: passwordHash }).execute();
}
