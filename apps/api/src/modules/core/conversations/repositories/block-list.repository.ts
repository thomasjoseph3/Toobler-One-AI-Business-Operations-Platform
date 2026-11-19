import { sql } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `block_list` table. Every query names the business as well as the id (defence in depth: the database also
// fences every query by business).

/** One blocked number or email as the database holds it. The service turns it into the API's BlockListEntry. */
export interface BlockListRow {
  id: string;
  /** The number as digits only, or null for an email entry. */
  phoneKey: string | null;
  /** The email in lower case, or null for a number entry. */
  email: string | null;
  reason: string | null;
  createdAt: Date;
}

/**
 * Makes the business's other changes to its block list wait their turn until the end of this transaction. Saving the list works
 * out what to add and remove from what is there, so two saves at the same moment must not both read the same list.
 */
export async function lockBlockListOfBusiness(db: Db, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`block_list:${accountId}`}))`.execute(db);
}

/**
 * All the business's entries, oldest first. Entries saved together share one moment, so they are then put in a fixed order (numbers
 * by their digits, then emails by their text), which never wobbles between two reads.
 */
export async function listBlockListRows(db: Db, accountId: string): Promise<BlockListRow[]> {
  const rows = await db
    .selectFrom('block_list')
    .select(['id', 'phone_key', 'email', 'reason', 'created_at'])
    .where('account_id', '=', accountId)
    .orderBy('created_at')
    .orderBy('phone_key', (order) => order.asc().nullsLast())
    .orderBy('email', (order) => order.asc().nullsLast())
    .execute();
  return rows.map((row) => ({
    id: row.id,
    phoneKey: row.phone_key,
    email: row.email,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/** Adds one entry: a number (as digits) or an email, never both. */
export async function insertBlockListEntry(
  db: Db,
  entry: {
    id: string;
    accountId: string;
    phoneKey: string | null;
    email: string | null;
    reason: string | null;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: entry.actor.kind, id: entry.actor.id };
  await db
    .insertInto('block_list')
    .values({
      id: entry.id,
      account_id: entry.accountId,
      phone_key: entry.phoneKey,
      email: entry.email,
      reason: entry.reason,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** Changes the reason on one entry (the only thing about an entry that can change). */
export async function updateBlockListReason(
  db: Db,
  options: { accountId: string; entryId: string; reason: string | null; actor: Actor },
): Promise<void> {
  await db
    .updateTable('block_list')
    .set({ reason: options.reason, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.entryId)
    .execute();
}

/** Removes the given entries of the business. */
export async function deleteBlockListEntries(db: Db, accountId: string, entryIds: readonly string[]): Promise<void> {
  if (entryIds.length === 0) return;
  await db
    .deleteFrom('block_list')
    .where('account_id', '=', accountId)
    .where('id', 'in', [...entryIds])
    .execute();
}
