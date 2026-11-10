import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `sessions` table (one row per sign-in on one device). Closed to the normal app role: only the owner
// connection reaches it, through the functions in this file. Only hashes of refresh tokens are ever stored.

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
