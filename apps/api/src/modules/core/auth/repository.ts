import type { Db } from '../../../kernel/database';

// Every query for sign-in lives here, and nowhere else (the repository pattern). In this first slice that is four small
// inserts and one check. They run on the owner connection (`database.system`) because when someone signs up there is no
// business yet to fence to.

/** ACROSS BUSINESSES. Whether any business already has a person with this email. */
export async function emailIsRegistered(db: Db, email: string): Promise<boolean> {
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return row !== undefined;
}

/** Adds a business. */
export async function insertAccount(db: Db, account: { id: string; name: string; industry: string }): Promise<void> {
  await db.insertInto('accounts').values(account).execute();
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

/** Stores a person's password hash (never the password itself). */
export async function insertCredentials(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.insertInto('user_credentials').values({ user_id: userId, password_hash: passwordHash }).execute();
}
