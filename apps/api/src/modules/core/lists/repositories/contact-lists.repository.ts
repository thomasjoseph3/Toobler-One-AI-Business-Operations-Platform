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

/** A person in a list, with when they were added. */
export interface ListMemberRow {
  contactId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  addedAt: Date;
}

/** One page of a list's live contacts, most recently added first. Deleted contacts are left out. */
export async function listMembers(
  db: Db,
  options: { accountId: string; listId: string; limit: number; offset: number },
): Promise<{ rows: ListMemberRow[]; total: number }> {
  const base = () =>
    db
      .selectFrom('contact_list_members as member')
      .innerJoin('contacts as contact', 'contact.id', 'member.contact_id')
      .where('member.account_id', '=', options.accountId)
      .where('member.list_id', '=', options.listId)
      .where('contact.deleted_at', 'is', null);
  const rows = await base()
    .select(['contact.id', 'contact.name', 'contact.phone', 'contact.email', 'member.added_at'])
    .orderBy('member.added_at', 'desc')
    .orderBy('contact.id')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  const count = await base()
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return {
    rows: rows.map((row) => ({
      contactId: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      addedAt: row.added_at,
    })),
    total: Number(count.total),
  };
}

/** Takes the list's row for update, so two requests that add people at the same moment take turns and the size limit holds. Returns false when there is no such list. */
export async function lockContactList(db: Db, accountId: string, listId: string): Promise<boolean> {
  const row = await db
    .selectFrom('contact_lists')
    .select('id')
    .where('account_id', '=', accountId)
    .where('id', '=', listId)
    .forUpdate()
    .executeTakeFirst();
  return row !== undefined;
}

/** Takes one contact out of a list. Returns false when that contact was not in the list. */
export async function removeMember(
  db: Db,
  options: { accountId: string; listId: string; contactId: string },
): Promise<boolean> {
  const row = await db
    .deleteFrom('contact_list_members')
    .where('account_id', '=', options.accountId)
    .where('list_id', '=', options.listId)
    .where('contact_id', '=', options.contactId)
    .returning('contact_id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Deletes a list for good; its member rows go with it. The contacts themselves are not touched. Returns false when there is no such list. */
export async function deleteContactList(db: Db, accountId: string, listId: string): Promise<boolean> {
  const row = await db
    .deleteFrom('contact_lists')
    .where('account_id', '=', accountId)
    .where('id', '=', listId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Puts the lists of one contact on another contact (the merge of two contacts): every list the first is in, the second is in too (a list
 * the second is already in is left alone), then the first leaves all its lists. Returns how many lists the first was in.
 */
export async function moveListMembershipsToContact(
  db: Db,
  options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
): Promise<number> {
  const memberships = await db
    .selectFrom('contact_list_members')
    .select('list_id')
    .where('account_id', '=', options.accountId)
    .where('contact_id', '=', options.fromContactId)
    .execute();
  if (memberships.length === 0) return 0;
  await db
    .insertInto('contact_list_members')
    .values(
      memberships.map((membership) => ({
        account_id: options.accountId,
        list_id: membership.list_id,
        contact_id: options.toContactId,
        added_by: { kind: options.actor.kind, id: options.actor.id },
      })),
    )
    .onConflict((conflict) => conflict.columns(['list_id', 'contact_id']).doNothing())
    .execute();
  await db
    .deleteFrom('contact_list_members')
    .where('account_id', '=', options.accountId)
    .where('contact_id', '=', options.fromContactId)
    .execute();
  return memberships.length;
}
