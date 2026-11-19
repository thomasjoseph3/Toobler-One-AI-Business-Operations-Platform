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

/** An open invitation found by its link, with the facts the accept page and the accept step need. */
export interface OpenInvitationFound {
  id: string;
  accountId: string;
  name: string;
  email: string;
  mobileE164: string | null;
  mobileKey: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  invitedBy: string;
  businessName: string;
  invitedByName: string;
}

/**
 * ACROSS BUSINESSES (runs on the owner connection). The invitation with this link hash, if it is still open: not accepted, not cancelled and not
 * expired. Does not use it up. Undefined for an unknown, used, cancelled or expired link (the caller must not say which).
 */
export async function findOpenInvitationByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<OpenInvitationFound | undefined> {
  const row = await db
    .selectFrom('invitations')
    .innerJoin('accounts', 'accounts.id', 'invitations.account_id')
    .innerJoin('users', (join) =>
      join.onRef('users.id', '=', 'invitations.invited_by').onRef('users.account_id', '=', 'invitations.account_id'),
    )
    .select([
      'invitations.id',
      'invitations.account_id',
      'invitations.name',
      'invitations.email',
      'invitations.mobile_e164',
      'invitations.mobile_key',
      'invitations.role',
      'invitations.invited_by',
      'accounts.name as business_name',
      'users.name as invited_by_name',
    ])
    .where('invitations.token_hash', '=', tokenHash)
    .where('invitations.accepted_at', 'is', null)
    .where('invitations.cancelled_at', 'is', null)
    .where('invitations.expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    email: row.email,
    mobileE164: row.mobile_e164,
    mobileKey: row.mobile_key,
    role: row.role,
    invitedBy: row.invited_by,
    businessName: row.business_name,
    invitedByName: row.invited_by_name,
  };
}

/**
 * ACROSS BUSINESSES (runs on the owner connection). Uses up the invitation with this link hash: ONE statement that marks it accepted only if it
 * is still open, so two requests with the same link at the same moment cannot both succeed. Returns undefined when it was not open.
 */
export async function markInvitationAccepted(db: Db, tokenHash: string): Promise<boolean> {
  const row = await db
    .updateTable('invitations')
    .set({ accepted_at: sql`now()` })
    .where('token_hash', '=', tokenHash)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** An invitation that is still open, found by its id and locked until the transaction ends. Undefined for an unknown id, a used or cancelled invitation, and another business's. */
export async function findOpenInvitationForUpdate(
  db: Db,
  accountId: string,
  invitationId: string,
): Promise<{ id: string; name: string; email: string } | undefined> {
  return db
    .selectFrom('invitations')
    .select(['id', 'name', 'email'])
    .where('account_id', '=', accountId)
    .where('id', '=', invitationId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
}

/** Gives an open invitation a new link (as its hash) that works for `hours` from now; the old link stops working. Returns the invitation as the Team screen shows it. */
export async function renewInvitation(
  db: Db,
  options: { accountId: string; invitationId: string; tokenHash: string; hours: number },
): Promise<InvitationRow> {
  const row = await db
    .updateTable('invitations')
    .set({
      token_hash: options.tokenHash,
      expires_at: sql<Date>`now() + ${options.hours} * interval '1 hour'`,
      updated_at: sql`now()`,
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.invitationId)
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

/** Cancels an open invitation: its link stops working and the email can be invited again. */
export async function cancelInvitation(db: Db, accountId: string, invitationId: string): Promise<void> {
  await db
    .updateTable('invitations')
    .set({ cancelled_at: sql`now()`, updated_at: sql`now()` })
    .where('account_id', '=', accountId)
    .where('id', '=', invitationId)
    .execute();
}
