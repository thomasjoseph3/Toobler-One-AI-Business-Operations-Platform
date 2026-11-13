import type { Pool } from 'pg';
import { uuidv7 } from '../apps/api/src/kernel/ids';

// The logic behind `npm run platform-admin`: who is a platform admin (the Toobler team), and making or un-making one. It works on
// the database through the owner connection and is reached only from that command, by someone who has the database address.
// Nothing in the running app can call it: on purpose, a business owner must never be able to promote themselves.

/** The result of asking for someone to become (or stop being) a platform admin. */
export type PlatformAdminChange =
  | { outcome: 'changed'; email: string; isPlatformAdmin: boolean }
  | { outcome: 'already'; email: string; isPlatformAdmin: boolean }
  | { outcome: 'not_found'; email: string }
  | { outcome: 'refused'; email: string; reason: string };

/** A person who is a platform admin. */
export interface PlatformAdminPerson {
  email: string;
  name: string;
  businessName: string;
}

/** Tidies an email the way sign-up stores it (no spaces, lower case) and refuses text that is clearly not an email. */
export function tidyEmail(text: string): string {
  const email = text.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`"${text}" does not look like an email address`);
  }
  return email;
}

/** Everyone who is a platform admin right now. */
export async function listPlatformAdmins(pool: Pool): Promise<PlatformAdminPerson[]> {
  const { rows } = await pool.query<{ email: string; name: string; business_name: string }>(
    `select u.email, u.name, a.name as business_name
       from app.users u join app.accounts a on a.id = u.account_id
      where u.is_platform_admin order by u.email`,
  );
  return rows.map((row) => ({ email: row.email, name: row.name, businessName: row.business_name }));
}

/**
 * Makes the person with this email a platform admin (`isPlatformAdmin` true) or takes it away (false). Making someone an admin needs a
 * person who exists, is active and has verified their email; taking it away works for anyone. Saying the same thing twice changes
 * nothing. A change is written to the person's business's activity log (by "the command line", field name only).
 */
export async function setPlatformAdmin(
  pool: Pool,
  rawEmail: string,
  isPlatformAdmin: boolean,
): Promise<PlatformAdminChange> {
  const email = tidyEmail(rawEmail);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{
      id: string;
      account_id: string;
      is_platform_admin: boolean;
      status: string;
      email_verified_at: Date | null;
    }>(
      'select id, account_id, is_platform_admin, status, email_verified_at from app.users where email = $1 for update',
      [email],
    );
    const person = rows[0];
    if (!person) {
      await client.query('rollback');
      return { outcome: 'not_found', email };
    }
    if (person.is_platform_admin === isPlatformAdmin) {
      await client.query('rollback');
      return { outcome: 'already', email, isPlatformAdmin };
    }
    if (isPlatformAdmin && person.status !== 'active') {
      await client.query('rollback');
      return { outcome: 'refused', email, reason: 'that person is switched off' };
    }
    if (isPlatformAdmin && person.email_verified_at === null) {
      await client.query('rollback');
      return { outcome: 'refused', email, reason: 'that person has not verified their email yet' };
    }
    await client.query('update app.users set is_platform_admin = $2 where id = $1', [person.id, isPlatformAdmin]);
    await client.query(
      `insert into app.activity_log (id, account_id, actor, kind, record_type, record_id, fields)
       values ($1, $2, $3, $4, 'user', $5, $6)`,
      [
        uuidv7(),
        person.account_id,
        JSON.stringify({ kind: 'system', id: 'command-line' }),
        isPlatformAdmin ? 'platform.admin_granted' : 'platform.admin_revoked',
        person.id,
        ['isPlatformAdmin'],
      ],
    );
    await client.query('commit');
    return { outcome: 'changed', email, isPlatformAdmin };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
