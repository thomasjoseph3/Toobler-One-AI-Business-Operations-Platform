import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `login_attempts` table (wrong passwords per email typed, for the lockout). Closed to the normal app
// role: only the owner connection reaches it, through the functions in this file. It is keyed by the email that was
// typed, whether or not an account has it, so a lockout never reveals which emails have accounts.

/** The lockout rules: this many wrong passwords inside the window lock the email for the lock time. */
export interface LockoutRules {
  maxFailures: number;
  windowMinutes: number;
  lockMinutes: number;
}

/** Whether this email is locked out right now (the database clock decides). */
export async function isLockedOut(db: Db, email: string): Promise<boolean> {
  const row = await db
    .selectFrom('login_attempts')
    .select('email')
    .where('email', '=', email)
    .where('locked_until', '>', sql<Date>`now()`)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Counts one more wrong password for this email, and locks it when the count reaches the limit. ONE statement, so
 * simultaneous wrong guesses cannot slip past the count. A count older than the window starts again at 1.
 */
export async function recordFailure(db: Db, email: string, rules: LockoutRules): Promise<void> {
  await sql`
    INSERT INTO login_attempts (email, failed_count, window_started_at)
    VALUES (${email}, 1, now())
    ON CONFLICT (email) DO UPDATE SET
      failed_count = CASE
        WHEN login_attempts.window_started_at < now() - ${rules.windowMinutes} * interval '1 minute' THEN 1
        ELSE login_attempts.failed_count + 1 END,
      window_started_at = CASE
        WHEN login_attempts.window_started_at < now() - ${rules.windowMinutes} * interval '1 minute' THEN now()
        ELSE login_attempts.window_started_at END,
      locked_until = CASE
        WHEN login_attempts.window_started_at < now() - ${rules.windowMinutes} * interval '1 minute' THEN NULL
        WHEN login_attempts.failed_count + 1 >= ${rules.maxFailures} THEN now() + ${rules.lockMinutes} * interval '1 minute'
        ELSE login_attempts.locked_until END`.execute(db);
}

/** Forgets the wrong passwords for this email (after a good sign-in). */
export async function clearFailures(db: Db, email: string): Promise<void> {
  await db.deleteFrom('login_attempts').where('email', '=', email).execute();
}
