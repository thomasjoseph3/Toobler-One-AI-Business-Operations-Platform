import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `sessions` table (one row per sign-in on one device). Closed to the normal app role: only the owner
// connection reaches it, through the functions in this file. Only hashes of refresh tokens are ever stored.

/** The signed-in person behind a session, with the facts every request needs. */
export interface LivePrincipal {
  accountId: string;
  userId: string;
  role: 'manager' | 'staff' | 'staff_own';
  sessionId: string;
  isPlatformAdmin: boolean;
}

/**
 * ACROSS BUSINESSES (runs on the owner connection). Who is behind an access token: the person and their business, but only
 * while the session is live (not ended, not past its maximum age) and the person is still active. Checked on every
 * request, so signing out or disabling someone stops their access at once, not when the token runs out.
 */
export async function findLivePrincipal(db: Db, sessionId: string, userId: string): Promise<LivePrincipal | undefined> {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'users.account_id',
      'users.id as user_id',
      'users.role',
      'users.is_platform_admin',
      'sessions.id as session_id',
    ])
    .where('sessions.id', '=', sessionId)
    .where('sessions.user_id', '=', userId)
    .where('sessions.revoked_at', 'is', null)
    .where('sessions.expires_at', '>', sql<Date>`now()`)
    .where('users.status', '=', 'active')
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    accountId: row.account_id,
    userId: row.user_id,
    role: row.role,
    sessionId: row.session_id,
    isPlatformAdmin: row.is_platform_admin,
  };
}

/** Opens a session. It ends `maxDays` from now at the latest. */
export async function insertSession(
  db: Db,
  session: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    userAgent: string | null;
    ip: string | null;
    maxDays: number;
  },
): Promise<void> {
  await db
    .insertInto('sessions')
    .values({
      id: session.id,
      user_id: session.userId,
      refresh_token_hash: session.refreshTokenHash,
      previous_refresh_token_hash: null,
      rotated_at: null,
      user_agent: session.userAgent,
      ip: session.ip,
      expires_at: sql<Date>`now() + ${session.maxDays} * interval '1 day'`,
      revoked_at: null,
      revoked_reason: null,
    })
    .execute();
}
