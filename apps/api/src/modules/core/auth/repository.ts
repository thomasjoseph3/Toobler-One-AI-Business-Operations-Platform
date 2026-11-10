import { sql } from 'kysely';
import type { Db } from '../../../kernel/db';

// Every query for sign-in lives here. Functions marked ACROSS BUSINESSES run on the owner connection (`database.system`)
// because they must work before a business is known (signing in, refreshing, clicking an email link); the tables they
// read are closed to the fenced app role. The others run inside a business's fence (`runInAccountTransaction`).

export interface LoginCandidate {
  id: string;
  accountId: string;
  name: string;
  role: 'manager' | 'staff' | 'staff_own';
  status: 'active' | 'disabled';
  emailVerified: boolean;
  passwordHash: string;
}

/** ACROSS BUSINESSES. The person with this email and their password hash, or undefined. */
export async function findLoginCandidateByEmail(db: Db, email: string): Promise<LoginCandidate | undefined> {
  const row = await db
    .selectFrom('users')
    .innerJoin('user_credentials', 'user_credentials.user_id', 'users.id')
    .select([
      'users.id',
      'users.account_id',
      'users.name',
      'users.role',
      'users.status',
      'users.email_verified_at',
      'user_credentials.password_hash',
    ])
    .where('users.email', '=', email)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified_at !== null,
    passwordHash: row.password_hash,
  };
}

/** ACROSS BUSINESSES. Whether any business already has a person with this email. */
export async function emailIsRegistered(db: Db, email: string): Promise<boolean> {
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return row !== undefined;
}

/** ACROSS BUSINESSES. The person behind an email link or a refresh, with the facts the service needs. */
export interface PersonSummary {
  id: string;
  accountId: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  emailVerified: boolean;
  mobileDigits: string | null;
}

export async function findPersonById(db: Db, userId: string): Promise<PersonSummary | undefined> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'account_id', 'email', 'name', 'status', 'email_verified_at', 'mobile_e164'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    email: row.email,
    name: row.name,
    status: row.status,
    emailVerified: row.email_verified_at !== null,
    mobileDigits: row.mobile_e164 ? row.mobile_e164.replace(/\D/g, '') : null,
  };
}

/** ACROSS BUSINESSES. The person with this email (for "forgot password"), or undefined. */
export async function findPersonByEmail(db: Db, email: string): Promise<PersonSummary | undefined> {
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return row ? findPersonById(db, row.id) : undefined;
}

export async function insertAccount(db: Db, account: { id: string; name: string; industry: string }): Promise<void> {
  await db.insertInto('accounts').values(account).execute();
}

export async function insertUser(
  db: Db,
  user: {
    id: string;
    accountId: string;
    email: string;
    name: string;
    mobileE164: string;
    mobileKey: string;
    role: 'manager' | 'staff' | 'staff_own';
    createdBy: { kind: string; id: string | null };
  },
): Promise<void> {
  await db
    .insertInto('users')
    .values({
      id: user.id,
      account_id: user.accountId,
      email: user.email,
      name: user.name,
      mobile_e164: user.mobileE164,
      mobile_key: user.mobileKey,
      role: user.role,
      email_verified_at: null,
      last_login_at: null,
      created_by: user.createdBy,
      updated_by: user.createdBy,
    })
    .execute();
}

export async function insertCredentials(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.insertInto('user_credentials').values({ user_id: userId, password_hash: passwordHash }).execute();
}

export async function setPasswordHash(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db
    .updateTable('user_credentials')
    .set({ password_hash: passwordHash, password_changed_at: sql`now()` })
    .where('user_id', '=', userId)
    .execute();
}

export async function markEmailVerified(db: Db, userId: string): Promise<void> {
  await db
    .updateTable('users')
    .set({ email_verified_at: sql`coalesce(email_verified_at, now())` })
    .where('id', '=', userId)
    .execute();
}

export async function markLoggedIn(db: Db, userId: string): Promise<void> {
  await db
    .updateTable('users')
    .set({ last_login_at: sql`now()` })
    .where('id', '=', userId)
    .execute();
}

// ---- Sign-in attempts (lockout) -------------------------------------------------------------------------------------

/** When this email is locked until, or null when it is not locked. */
export async function findLockedUntil(db: Db, keyHash: string): Promise<Date | null> {
  const row = await db
    .selectFrom('login_attempts')
    .select('locked_until')
    .where('key_hash', '=', keyHash)
    .where('locked_until', '>', sql<Date>`now()`)
    .executeTakeFirst();
  return row?.locked_until ?? null;
}

/**
 * Counts one more failed sign-in for this email. Failures older than the lock window do not count. When the count
 * reaches `maxFailures` the email is locked for `lockMinutes` and the counter starts again. Returns whether it locked.
 */
export async function recordFailedLogin(
  db: Db,
  keyHash: string,
  limits: { maxFailures: number; lockMinutes: number },
): Promise<boolean> {
  const result = await sql<{ failed_count: number }>`
    insert into login_attempts (key_hash, failed_count, updated_at) values (${keyHash}, 1, now())
    on conflict (key_hash) do update set
      failed_count = case
        when login_attempts.updated_at < now() - ${limits.lockMinutes} * interval '1 minute' then 1
        else login_attempts.failed_count + 1 end,
      updated_at = now()
    returning failed_count`.execute(db);
  const failedCount = result.rows[0]?.failed_count ?? 1;
  if (failedCount < limits.maxFailures) return false;
  await sql`update login_attempts
            set locked_until = now() + ${limits.lockMinutes} * interval '1 minute', failed_count = 0
            where key_hash = ${keyHash}`.execute(db);
  return true;
}

export async function clearLoginAttempts(db: Db, keyHash: string): Promise<void> {
  await db.deleteFrom('login_attempts').where('key_hash', '=', keyHash).execute();
}

// ---- Email links ----------------------------------------------------------------------------------------------------

export async function insertAuthToken(
  db: Db,
  token: {
    id: string;
    kind: 'email_verify' | 'password_reset';
    userId: string;
    secretHash: string;
    lifetimeHours: number;
  },
): Promise<void> {
  await db
    .insertInto('auth_tokens')
    .values({
      id: token.id,
      kind: token.kind,
      user_id: token.userId,
      secret_hash: token.secretHash,
      expires_at: sql<Date>`now() + ${token.lifetimeHours} * interval '1 hour'`,
      used_at: null,
    })
    .execute();
}

/** An unused, unexpired link of this kind, or undefined. */
export async function findUsableAuthToken(
  db: Db,
  kind: 'email_verify' | 'password_reset',
  secretHash: string,
): Promise<{ id: string; userId: string } | undefined> {
  const row = await db
    .selectFrom('auth_tokens')
    .select(['id', 'user_id'])
    .where('kind', '=', kind)
    .where('secret_hash', '=', secretHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst();
  return row ? { id: row.id, userId: row.user_id } : undefined;
}

/** Marks a link used. Returns false when someone else used it first (so a link works exactly once). */
export async function useAuthToken(db: Db, tokenId: string): Promise<boolean> {
  const result = await db
    .updateTable('auth_tokens')
    .set({ used_at: sql`now()` })
    .where('id', '=', tokenId)
    .where('used_at', 'is', null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
}

/** Retires the person's older unused links of this kind, so only the newest one works. */
export async function retireAuthTokens(db: Db, userId: string, kind: 'email_verify' | 'password_reset'): Promise<void> {
  await db
    .updateTable('auth_tokens')
    .set({ used_at: sql`now()` })
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .where('used_at', 'is', null)
    .execute();
}

// ---- Sessions -------------------------------------------------------------------------------------------------------

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

export interface SessionForRefresh {
  id: string;
  userId: string;
  /** Whether the presented token is the current one, or the one it replaced. */
  matched: 'current' | 'previous';
  rotatedWithinGraceSeconds: boolean;
  isLive: boolean;
}

/**
 * ACROSS BUSINESSES. Finds the session a refresh token belongs to (as its current token, or as the one just replaced),
 * and says whether it is still live: not ended, not past its maximum age, used within the idle limit.
 */
export async function findSessionForRefresh(
  db: Db,
  refreshTokenHash: string,
  limits: { idleDays: number; graceSeconds: number },
): Promise<SessionForRefresh | undefined> {
  const result = await sql<{
    id: string;
    user_id: string;
    matched: 'current' | 'previous';
    within_grace: boolean;
    is_live: boolean;
  }>`
    select s.id, s.user_id,
           case when s.refresh_token_hash = ${refreshTokenHash} then 'current' else 'previous' end as matched,
           coalesce(s.rotated_at > now() - ${limits.graceSeconds} * interval '1 second', false) as within_grace,
           (s.revoked_at is null
            and s.expires_at > now()
            and s.last_used_at > now() - ${limits.idleDays} * interval '1 day'
            and u.status = 'active') as is_live
    from sessions s join users u on u.id = s.user_id
    where s.refresh_token_hash = ${refreshTokenHash} or s.previous_refresh_token_hash = ${refreshTokenHash}
    limit 1`.execute(db);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    matched: row.matched,
    rotatedWithinGraceSeconds: row.within_grace,
    isLive: row.is_live,
  };
}

/**
 * Replaces the session's refresh token in one atomic step, keeping the old hash for the grace period. Returns false when
 * the token was already replaced by a request that arrived at the same moment.
 */
export async function rotateRefreshToken(
  db: Db,
  sessionId: string,
  oldHash: string,
  newHash: string,
): Promise<boolean> {
  const result = await db
    .updateTable('sessions')
    .set({
      previous_refresh_token_hash: oldHash,
      refresh_token_hash: newHash,
      rotated_at: sql`now()`,
      last_used_at: sql`now()`,
    })
    .where('id', '=', sessionId)
    .where('refresh_token_hash', '=', oldHash)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
}

export async function revokeSession(db: Db, sessionId: string, reason: string): Promise<void> {
  await db
    .updateTable('sessions')
    .set({ revoked_at: sql`now()`, revoked_reason: reason })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute();
}

/** Ends all of a person's sessions, except `keepSessionId` when given (a password change keeps the current one). */
export async function revokeSessionsOfUser(
  db: Db,
  userId: string,
  reason: string,
  keepSessionId: string | null,
): Promise<void> {
  let query = db
    .updateTable('sessions')
    .set({ revoked_at: sql`now()`, revoked_reason: reason })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null);
  if (keepSessionId) query = query.where('id', '!=', keepSessionId);
  await query.execute();
}

export interface LivePrincipal {
  accountId: string;
  userId: string;
  role: 'manager' | 'staff' | 'staff_own';
  sessionId: string;
  emailVerified: boolean;
}

/** ACROSS BUSINESSES. The signed-in person behind an access token, if the session is live and the person active. */
export async function findLivePrincipal(db: Db, sessionId: string, userId: string): Promise<LivePrincipal | undefined> {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'users.account_id',
      'users.id as user_id',
      'users.role',
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
    emailVerified: row.email_verified_at !== null,
  };
}

/** ACROSS BUSINESSES. The stored password hash of a person, for checking their current password. */
export async function findPasswordHash(db: Db, userId: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('user_credentials')
    .select('password_hash')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row?.password_hash;
}

// ---- The signed-in person's own data (inside the business fence) ----------------------------------------------------

export interface ProfileRow {
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  emailVerified: boolean;
  businessId: string;
  businessName: string;
  industry: string;
  timeZone: string;
}

/** The person and their business. Run it inside the business's fence: it can only ever see that business. */
export async function findProfile(db: Db, userId: string): Promise<ProfileRow | undefined> {
  const row = await db
    .selectFrom('users')
    .innerJoin('accounts', 'accounts.id', 'users.account_id')
    .select([
      'users.id as user_id',
      'users.name',
      'users.email',
      'users.mobile_e164',
      'users.role',
      'users.email_verified_at',
      'accounts.id as business_id',
      'accounts.name as business_name',
      'accounts.industry',
      'accounts.time_zone',
    ])
    .where('users.id', '=', userId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    mobile: row.mobile_e164,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
    businessId: row.business_id,
    businessName: row.business_name,
    industry: row.industry,
    timeZone: row.time_zone,
  };
}

export async function updateUserName(
  db: Db,
  userId: string,
  name: string,
  updatedBy: { kind: string; id: string | null },
): Promise<void> {
  await db.updateTable('users').set({ name, updated_by: updatedBy }).where('id', '=', userId).execute();
}
