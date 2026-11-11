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
  emailVerified: boolean;
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
      'users.email_verified_at',
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
    emailVerified: row.email_verified_at !== null,
  };
}

/** Ends a session, with the reason ("signed out"). Does nothing if it has already ended. */
export async function revokeSession(db: Db, sessionId: string, reason: string): Promise<void> {
  await db
    .updateTable('sessions')
    .set({ revoked_at: sql`now()`, revoked_reason: reason })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute();
}

/** Ends every live session of a person, on every device, with the reason. Returns how many it ended. */
export async function revokeAllSessionsForUser(db: Db, userId: string, reason: string): Promise<number> {
  const rows = await db
    .updateTable('sessions')
    .set({ revoked_at: sql`now()`, revoked_reason: reason })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .execute();
  return rows.length;
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

/** A session found by the refresh token someone presented, with what the refresh rules need to decide. */
export interface SessionForRefresh {
  sessionId: string;
  userId: string;
  accountId: string;
  /** The token matched the one that was just replaced (not the current one). */
  matchedPrevious: boolean;
  /** Not ended, within its maximum age, not idle for too long, and the person is still active. */
  isLive: boolean;
  /** The token was replaced only moments ago, so a second request using it is a harmless race, not theft. */
  withinGrace: boolean;
}

/**
 * ACROSS BUSINESSES (runs on the owner connection). The session whose current OR just-replaced refresh token has this
 * hash, or undefined. The database clock decides every time rule, so the app's clock cannot disagree with it.
 */
export async function findSessionByRefreshHash(
  db: Db,
  refreshTokenHash: string,
  rules: { idleDays: number; graceSeconds: number },
): Promise<SessionForRefresh | undefined> {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'sessions.id as session_id',
      'users.id as user_id',
      'users.account_id',
      'sessions.refresh_token_hash',
      sql<boolean>`(sessions.revoked_at is null
        and sessions.expires_at > now()
        and sessions.last_used_at > now() - ${rules.idleDays} * interval '1 day'
        and users.status = 'active')`.as('is_live'),
      sql<boolean>`(sessions.rotated_at is not null
        and sessions.rotated_at > now() - ${rules.graceSeconds} * interval '1 second')`.as('within_grace'),
    ])
    .where((condition) =>
      condition.or([
        condition('sessions.refresh_token_hash', '=', refreshTokenHash),
        condition('sessions.previous_refresh_token_hash', '=', refreshTokenHash),
      ]),
    )
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    accountId: row.account_id,
    matchedPrevious: row.refresh_token_hash !== refreshTokenHash,
    isLive: row.is_live,
    withinGrace: row.within_grace,
  };
}

/**
 * Swaps in a new refresh token and keeps the old one's hash as "just replaced". ONE statement that only matches while the
 * session still holds the old token, so of several requests refreshing at the same moment exactly one succeeds.
 * Returns false when it lost that race.
 */
export async function rotateRefreshToken(
  db: Db,
  rotation: { sessionId: string; oldRefreshTokenHash: string; newRefreshTokenHash: string },
): Promise<boolean> {
  const row = await db
    .updateTable('sessions')
    .set({
      previous_refresh_token_hash: rotation.oldRefreshTokenHash,
      refresh_token_hash: rotation.newRefreshTokenHash,
      rotated_at: sql`now()`,
      last_used_at: sql`now()`,
    })
    .where('id', '=', rotation.sessionId)
    .where('refresh_token_hash', '=', rotation.oldRefreshTokenHash)
    .where('revoked_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
