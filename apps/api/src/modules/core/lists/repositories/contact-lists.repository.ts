import { sql } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `contact_lists` and `contact_list_members` tables. Every function names the business. Run each inside the business's fence.

/** A list as the database holds it, with how many live contacts it has. */
export interface ContactListRow {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
}

/** How many live (not deleted) contacts each list has: the count is of the members whose contact still exists. */
const MEMBER_COUNT = sql<string>`(
  select count(*) from contact_list_members as member
  join contacts as contact on contact.id = member.contact_id and contact.deleted_at is null
  where member.list_id = list.id and member.account_id = list.account_id
)`;

/** Turns a database row into a ContactListRow. */
function toContactListRow(row: { id: string; name: string; member_count: string; created_at: Date }): ContactListRow {
  return { id: row.id, name: row.name, memberCount: Number(row.member_count), createdAt: row.created_at };
}

/** All the business's lists, oldest first (so they keep their places), each with its member count. */
export async function listContactLists(db: Db, accountId: string): Promise<ContactListRow[]> {
  const rows = await db
    .selectFrom('contact_lists as list')
    .select(['list.id', 'list.name', 'list.created_at', MEMBER_COUNT.as('member_count')])
    .where('list.account_id', '=', accountId)
    .orderBy('list.created_at')
    .orderBy('list.id')
    .execute();
  return rows.map(toContactListRow);
}

/** One list of the business with its member count, or undefined (also for another business's list). */
export async function findContactListById(
  db: Db,
  accountId: string,
  listId: string,
): Promise<ContactListRow | undefined> {
  const row = await db
    .selectFrom('contact_lists as list')
    .select(['list.id', 'list.name', 'list.created_at', MEMBER_COUNT.as('member_count')])
    .where('list.account_id', '=', accountId)
    .where('list.id', '=', listId)
    .executeTakeFirst();
  return row === undefined ? undefined : toContactListRow(row);
}

/** Adds a list. Throws a unique-violation (23505) when the business already has a list with this name (whatever the capitals). */
export async function insertContactList(
  db: Db,
  list: { id: string; accountId: string; name: string; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: list.actor.kind, id: list.actor.id };
  await db
    .insertInto('contact_lists')
    .values({
      id: list.id,
      account_id: list.accountId,
      name: list.name,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** Puts these contacts in the list. A contact already in it is left as it is. Returns how many were newly added. */
export async function addMembers(
  db: Db,
  options: { accountId: string; listId: string; contactIds: string[]; actor: Actor },
): Promise<number> {
  if (options.contactIds.length === 0) return 0;
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const inserted = await db
    .insertInto('contact_list_members')
    .values(
      options.contactIds.map((contactId) => ({
        account_id: options.accountId,
        list_id: options.listId,
        contact_id: contactId,
        added_by: actorStamp,
      })),
    )
    .onConflict((conflict) => conflict.columns(['list_id', 'contact_id']).doNothing())
    .returning('contact_id')
    .execute();
  return inserted.length;
}
