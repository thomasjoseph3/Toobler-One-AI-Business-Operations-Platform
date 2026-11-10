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
      created_by: user.createdBy,
      updated_by: user.createdBy,
    })
    .execute();
}
