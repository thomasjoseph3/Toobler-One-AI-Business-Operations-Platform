import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `users` table (a person in a business).

/** ACROSS BUSINESSES (runs on the owner connection). Whether any business already has a person with this email. */
export async function emailIsRegistered(db: Db, email: string): Promise<boolean> {
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return row !== undefined;
}

/** Adds a person to a business. */
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
      last_login_at: null,
      created_by: user.createdBy,
      updated_by: user.createdBy,
    })
    .execute();
}

/** A person found by email, for signing in. */
export interface PersonForSignIn {
  id: string;
  accountId: string;
  name: string;
  email: string;
  mobile: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  status: 'active' | 'disabled';
  emailVerified: boolean;
}

/** ACROSS BUSINESSES (runs on the owner connection). The person with this email, or undefined. */
export async function findPersonByEmail(db: Db, email: string): Promise<PersonForSignIn | undefined> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'account_id', 'name', 'email', 'mobile_e164', 'role', 'status', 'email_verified_at'])
    .where('email', '=', email)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    email: row.email,
    mobile: row.mobile_e164,
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified_at !== null,
  };
}

/** A person as the profile shows them. */
export interface PersonProfile {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  emailVerified: boolean;
}

/**
 * A person by id, or undefined. Run it inside a business's fence (`runInAccountTransaction`): it can then only ever find
 * people of that business, so another business's person answers exactly like a missing one.
 */
export async function findPersonProfileById(db: Db, userId: string): Promise<PersonProfile | undefined> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'name', 'email', 'mobile_e164', 'role', 'email_verified_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile_e164,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
  };
}

/** Records that the person has just signed in. */
export async function markLoggedIn(db: Db, userId: string): Promise<void> {
  await db
    .updateTable('users')
    .set({ last_login_at: sql`now()` })
    .where('id', '=', userId)
    .execute();
}

/**
 * ACROSS BUSINESSES (runs on the owner connection, because the app role may not write this column). Records that the
 * person proved they own their email, keeping the first time if it was already recorded. Returns the person's business
 * (for the activity log), or undefined if there is no such person.
 */
export async function markEmailVerified(db: Db, userId: string): Promise<{ accountId: string } | undefined> {
  const row = await db
    .updateTable('users')
    .set({ email_verified_at: sql`coalesce(email_verified_at, now())` })
    .where('id', '=', userId)
    .returning('account_id')
    .executeTakeFirst();
  return row ? { accountId: row.account_id } : undefined;
}

/** A person by id, for sending them an email (their name and address, and whether they are already verified). */
export async function findPersonForEmail(
  db: Db,
  userId: string,
): Promise<{ name: string; email: string; emailVerified: boolean } | undefined> {
  const row = await db
    .selectFrom('users')
    .select(['name', 'email', 'email_verified_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row) return undefined;
  return { name: row.name, email: row.email, emailVerified: row.email_verified_at !== null };
}
