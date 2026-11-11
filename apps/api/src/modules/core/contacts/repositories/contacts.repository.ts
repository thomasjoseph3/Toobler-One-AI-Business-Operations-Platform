import type { Contact, LifecycleStage } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { ContactSearch } from '../helpers/contact-search';

// The SQL for the `contacts` table (the people a business deals with). Every function names the business it works for,
// and only ever sees contacts that are not deleted.

/** The columns every read returns. */
const CONTACT_COLUMNS = [
  'id',
  'name',
  'phone',
  'email',
  'language',
  'lifecycle_stage',
  'created_at',
  'updated_at',
] as const;

/** Turns a database row into the Contact the API answers with. */
function toContact(row: {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  lifecycle_stage: LifecycleStage;
  created_at: Date;
  updated_at: Date;
}): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    language: row.language,
    lifecycleStage: row.lifecycle_stage,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adds a contact and returns it. */
export async function insertContact(
  db: Db,
  contact: {
    id: string;
    accountId: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    language: string | null;
    actor: Actor;
  },
): Promise<Contact> {
  const actorStamp = { kind: contact.actor.kind, id: contact.actor.id };
  const row = await db
    .insertInto('contacts')
    .values({
      id: contact.id,
      account_id: contact.accountId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      language: contact.language,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(CONTACT_COLUMNS)
    .executeTakeFirstOrThrow();
  return toContact(row);
}

/** The id of the live contact with this phone key (the digits of the international number), or undefined. */
export async function findContactIdByPhoneKey(
  db: Db,
  accountId: string,
  phoneKey: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('contacts')
    .select('id')
    .where('account_id', '=', accountId)
    .where('phone_key', '=', phoneKey)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.id;
}

/** The id of the live contact with this (lower-case) email, or undefined. */
export async function findContactIdByEmail(db: Db, accountId: string, email: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('contacts')
    .select('id')
    .where('account_id', '=', accountId)
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.id;
}

/** One page of the business's contacts, newest change first, plus how many there are in all (for the same search and filter). */
export async function listContacts(
  db: Db,
  accountId: string,
  options: { search: ContactSearch | null; lifecycleStage: LifecycleStage | undefined; limit: number; offset: number },
): Promise<{ items: Contact[]; total: number }> {
  /** The filters shared by the page query and the count query. */
  const filtered = () => {
    let query = db.selectFrom('contacts').where('account_id', '=', accountId).where('deleted_at', 'is', null);
    if (options.lifecycleStage) query = query.where('lifecycle_stage', '=', options.lifecycleStage);
    const search = options.search;
    if (search?.kind === 'phone') {
      query = query.where('phone_key', 'like', `%${search.digits}%`);
    } else if (search?.kind === 'text') {
      query = query.where((expression) =>
        expression.or([
          expression('name', 'ilike', search.likePattern),
          expression('email', 'ilike', search.likePattern),
        ]),
      );
    }
    return query;
  };

  const rows = await filtered()
    .select(CONTACT_COLUMNS)
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  const countRow = await filtered()
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return { items: rows.map(toContact), total: Number(countRow.total) };
}
