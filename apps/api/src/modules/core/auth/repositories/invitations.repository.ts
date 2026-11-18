import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for the `invitations` table (people a manager has invited). Fenced by business, except the two functions marked
// "ACROSS BUSINESSES", which run on the owner connection because the person opening the link is not signed in yet.

/** An invitation as the Team screen shows it. */
export interface InvitationRow {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  invitedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
}

/** Turns a database row into an InvitationRow. */
function toInvitationRow(row: {
  id: string;
  name: string;
  email: string;
  mobile_e164: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  created_at: Date;
  expires_at: Date;
  is_expired: boolean;
}): InvitationRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile_e164,
    role: row.role,
    invitedAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: row.is_expired,
  };
}

/** Saves a new invitation that works for `hours` from now. Throws a unique-violation (23505) when this email already has an open invitation. */
export async function insertInvitation(
  db: Db,
  invitation: {
    id: string;
    accountId: string;
    email: string;
    name: string;
    mobileE164: string | null;
    mobileKey: string | null;
    role: 'manager' | 'staff' | 'staff_own';
    tokenHash: string;
    invitedBy: string;
    hours: number;
  },
): Promise<InvitationRow> {
  const row = await db
    .insertInto('invitations')
    .values({
      id: invitation.id,
      account_id: invitation.accountId,
      email: invitation.email,
      name: invitation.name,
      mobile_e164: invitation.mobileE164,
      mobile_key: invitation.mobileKey,
      role: invitation.role,
      token_hash: invitation.tokenHash,
      invited_by: invitation.invitedBy,
      expires_at: sql<Date>`now() + ${invitation.hours} * interval '1 hour'`,
    })
    .returning([
      'id',
      'name',
      'email',
      'mobile_e164',
      'role',
      'created_at',
      'expires_at',
      sql<boolean>`expires_at < now()`.as('is_expired'),
    ])
    .executeTakeFirstOrThrow();
  return toInvitationRow(row);
}

/** The invitations of the business that are still waiting (not accepted, not cancelled), newest first. Run it inside the business's own transaction. */
export async function listOpenInvitations(db: Db, accountId: string): Promise<InvitationRow[]> {
  const rows = await db
    .selectFrom('invitations')
    .select([
      'id',
      'name',
      'email',
      'mobile_e164',
      'role',
      'created_at',
      'expires_at',
      sql<boolean>`expires_at < now()`.as('is_expired'),
    ])
    .where('account_id', '=', accountId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map(toInvitationRow);
}
