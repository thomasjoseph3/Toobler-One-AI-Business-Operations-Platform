import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `auth_tokens` table (single-use links we email). Closed to the normal app role: only the owner
// connection reaches it, through the functions in this file. Only hashes of the links are ever stored.

/** What a link is for. */
export type AuthTokenPurpose = 'verify_email' | 'reset_password';

/** Saves a new link (as its hash) that works for `hours` from now and can be used once. */
export async function insertAuthToken(
  db: Db,
  token: { id: string; userId: string; purpose: AuthTokenPurpose; tokenHash: string; hours: number },
): Promise<void> {
  await db
    .insertInto('auth_tokens')
    .values({
      id: token.id,
      user_id: token.userId,
      purpose: token.purpose,
      token_hash: token.tokenHash,
      expires_at: sql<Date>`now() + ${token.hours} * interval '1 hour'`,
      used_at: null,
    })
    .execute();
}

/** Throws away the person's links of this kind that have not been used, so only the newest link works. */
export async function deleteUnusedAuthTokens(db: Db, userId: string, purpose: AuthTokenPurpose): Promise<void> {
  await db
    .deleteFrom('auth_tokens')
    .where('user_id', '=', userId)
    .where('purpose', '=', purpose)
    .where('used_at', 'is', null)
    .execute();
}

/**
 * ACROSS BUSINESSES (runs on the owner connection). Uses up a link: if the hash matches a link of this kind that is not
 * used and not expired, marks it used and returns whose it is. It is ONE statement, so two requests with the same link
 * at the same moment cannot both succeed. Returns undefined when the link is unknown, used or expired (the caller must
 * not say which).
 */
export async function useAuthToken(
  db: Db,
  tokenHash: string,
  purpose: AuthTokenPurpose,
): Promise<{ userId: string } | undefined> {
  const row = await db
    .updateTable('auth_tokens')
    .set({ used_at: sql`now()` })
    .where('token_hash', '=', tokenHash)
    .where('purpose', '=', purpose)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning('user_id')
    .executeTakeFirst();
  return row ? { userId: row.user_id } : undefined;
}
