import type { CheckedFilterCondition, Contact, LifecycleStage } from '@toobler-one/shared';
import { conditionsToSql } from '../../../../kernel/filters/conditions-to-sql';
import { sql } from 'kysely';
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
  'company_id',
  'custom',
  'imported_at',
  'created_at',
  'updated_at',
] as const;

/** Keeps only the answers that are text, numbers or yes/no (a damaged row never breaks a screen). Hiding removed fields happens in the service. */
function toCustomValues(stored: unknown): Contact['custom'] {
  const answers: Contact['custom'] = {};
  if (typeof stored !== 'object' || stored === null) return answers;
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') answers[key] = value;
  }
  return answers;
}

/** Turns a database row into the Contact the API answers with. */
function toContact(row: {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  lifecycle_stage: LifecycleStage;
  company_id: string | null;
  custom: Record<string, unknown>;
  imported_at: Date | null;
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
    companyId: row.company_id,
    custom: toCustomValues(row.custom),
    importedAt: row.imported_at?.toISOString() ?? null,
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
    custom: Contact['custom'];
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
      custom: JSON.stringify(contact.custom),
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(CONTACT_COLUMNS)
    .executeTakeFirstOrThrow();
  return toContact(row);
}

/**
 * Adds a contact unless a live contact already has this phone or email (the database's unique rules decide, so two requests at the same
 * moment cannot both add it, and a refusal does not break the caller's transaction). Returns true when the contact was added.
 */
export async function insertContactIfFree(
  db: Db,
  contact: { id: string; accountId: string; phone: string | null; email: string | null; actor: Actor },
): Promise<boolean> {
  const actorStamp = { kind: contact.actor.kind, id: contact.actor.id };
  const result = await db
    .insertInto('contacts')
    .values({
      id: contact.id,
      account_id: contact.accountId,
      name: null,
      phone: contact.phone,
      email: contact.email,
      language: null,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) => conflict.doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
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
  options: {
    search: ContactSearch | null;
    lifecycleStage: LifecycleStage | undefined;
    /** Filter-engine conditions that already passed the shared check; every one must hold. */
    conditions?: readonly CheckedFilterCondition[];
    limit: number;
    offset: number;
  },
): Promise<{ items: Contact[]; total: number }> {
  /** The filters shared by the page query and the count query. */
  const filtered = () => {
    let query = db.selectFrom('contacts').where('account_id', '=', accountId).where('deleted_at', 'is', null);
    if (options.lifecycleStage) query = query.where('lifecycle_stage', '=', options.lifecycleStage);
    const conditionSql = conditionsToSql(options.conditions ?? [], { customColumn: 'custom', builtInColumns: {} });
    if (conditionSql) query = query.where(conditionSql);
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

/** One live contact of the business, or undefined (also for a deleted contact or another business's contact). */
export async function findContactById(db: Db, accountId: string, contactId: string): Promise<Contact | undefined> {
  const row = await db
    .selectFrom('contacts')
    .select(CONTACT_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', contactId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toContact(row) : undefined;
}

/** Like findContactById, but locks the row until the transaction ends, so two edits at once cannot overwrite each other. */
export async function findContactForUpdate(db: Db, accountId: string, contactId: string): Promise<Contact | undefined> {
  const row = await db
    .selectFrom('contacts')
    .select(CONTACT_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', contactId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  return row ? toContact(row) : undefined;
}

/** The new values of a contact. A key that is left out is not touched; `null` clears the field. */
export interface ContactChanges {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  language?: string | null;
  lifecycleStage?: LifecycleStage;
  /** The whole new set of answers (the service merges what was sent into what is stored). */
  custom?: Record<string, unknown>;
}

/** Changes the listed fields of a live contact, stamps who did it, and returns the contact. Undefined if there is no such live contact. */
export async function updateContact(
  db: Db,
  accountId: string,
  contactId: string,
  changes: ContactChanges,
  actor: Actor,
): Promise<Contact | undefined> {
  const row = await db
    .updateTable('contacts')
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
      ...(changes.email !== undefined ? { email: changes.email } : {}),
      ...(changes.language !== undefined ? { language: changes.language } : {}),
      ...(changes.lifecycleStage !== undefined ? { lifecycle_stage: changes.lifecycleStage } : {}),
      ...(changes.custom !== undefined ? { custom: JSON.stringify(changes.custom) } : {}),
      updated_by: { kind: actor.kind, id: actor.id },
    })
    .where('account_id', '=', accountId)
    .where('id', '=', contactId)
    .where('deleted_at', 'is', null)
    .returning(CONTACT_COLUMNS)
    .executeTakeFirst();
  return row ? toContact(row) : undefined;
}

/**
 * Soft-deletes a live contact: sets `deleted_at` and stamps who did it. The row stays (the app role cannot delete rows), it
 * just stops showing up and frees its phone and email for a new contact. Returns false when there is no such live contact.
 */
export async function softDeleteContact(db: Db, accountId: string, contactId: string, actor: Actor): Promise<boolean> {
  const row = await db
    .updateTable('contacts')
    .set({ deleted_at: new Date(), updated_by: { kind: actor.kind, id: actor.id } })
    .where('account_id', '=', accountId)
    .where('id', '=', contactId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** The live contacts among these ids, in no particular order. Deleted contacts and other businesses' contacts are left out. */
export async function findContactsByIds(db: Db, accountId: string, contactIds: string[]): Promise<Contact[]> {
  if (contactIds.length === 0) return [];
  const rows = await db
    .selectFrom('contacts')
    .select(CONTACT_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', 'in', contactIds)
    .where('deleted_at', 'is', null)
    .execute();
  return rows.map(toContact);
}

/** Which contacts belong to which of these companies (live contacts only). Run it inside the business's fence. */
export async function findContactCompanyLinks(
  db: Db,
  accountId: string,
  companyIds: string[],
): Promise<Array<{ contactId: string; companyId: string }>> {
  if (companyIds.length === 0) return [];
  const rows = await db
    .selectFrom('contacts')
    .select(['id', 'company_id'])
    .where('account_id', '=', accountId)
    .where('company_id', 'in', companyIds)
    .where('deleted_at', 'is', null)
    .execute();
  return rows.flatMap((row) => (row.company_id === null ? [] : [{ contactId: row.id, companyId: row.company_id }]));
}

/** The live contacts that belong to this company, by name. Run it inside the business's fence. */
export async function findContactsOfCompany(db: Db, accountId: string, companyId: string): Promise<Contact[]> {
  const rows = await db
    .selectFrom('contacts')
    .select(CONTACT_COLUMNS)
    .where('account_id', '=', accountId)
    .where('company_id', '=', companyId)
    .where('deleted_at', 'is', null)
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map(toContact);
}

/** Puts a live contact in a company (or takes it out of any company with `null`), and stamps who did it. Returns the contact, or undefined when there is no such live contact. */
export async function setContactCompany(
  db: Db,
  options: { accountId: string; contactId: string; companyId: string | null; actor: Actor },
): Promise<Contact | undefined> {
  const row = await db
    .updateTable('contacts')
    .set({ company_id: options.companyId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.contactId)
    .where('deleted_at', 'is', null)
    .returning(CONTACT_COLUMNS)
    .executeTakeFirst();
  return row ? toContact(row) : undefined;
}

/** Takes every contact out of this company (when the company is deleted). Returns how many contacts were let go. */
export async function clearCompanyOfContacts(
  db: Db,
  options: { accountId: string; companyId: string; actor: Actor },
): Promise<number> {
  const rows = await db
    .updateTable('contacts')
    .set({ company_id: null, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('company_id', '=', options.companyId)
    .returning('id')
    .execute();
  return rows.length;
}

/** Puts a live contact in a company only if it is not in one yet, and stamps who did it. Returns whether it was put in. */
export async function setContactCompanyIfNone(
  db: Db,
  options: { accountId: string; contactId: string; companyId: string; actor: Actor },
): Promise<boolean> {
  const row = await db
    .updateTable('contacts')
    .set({ company_id: options.companyId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.contactId)
    .where('company_id', 'is', null)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Deletes one custom field's answer from every contact of the business (the purge of a removed field). Records without that answer are not
 * touched. Returns how many records changed.
 */
export async function removeCustomAnswerKey(
  db: Db,
  options: { accountId: string; key: string; actor: Actor },
): Promise<number> {
  const result = await db
    .updateTable('contacts')
    .set({
      custom: sql<string>`custom - ${options.key}::text`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where(sql<boolean>`jsonb_exists(custom, ${options.key})`)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

/**
 * Adds answers to a live contact's custom fields, but only for keys it has no answer for yet (what staff typed is never overridden by what the AI
 * heard). One statement, so running it twice gives the same result. Returns whether the contact exists.
 */
export async function addCustomAnswersWhereEmpty(
  db: Db,
  options: { accountId: string; contactId: string; answers: Record<string, unknown>; actor: Actor },
): Promise<boolean> {
  const row = await db
    .updateTable('contacts')
    .set({
      // "new answers || stored answers": on a key in both, the stored one wins
      custom: sql<string>`${JSON.stringify(options.answers)}::jsonb || custom`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.contactId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Adds a contact made by an import, with all the details the file gave, unless a live contact already has this phone or email (the database's unique rules
 * decide, so two rows or two imports at the same moment cannot both add it, and a refusal does not break the caller's transaction). Returns true when added.
 */
export async function insertImportedContactIfFree(
  db: Db,
  contact: {
    id: string;
    accountId: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    language: string | null;
    custom: Record<string, unknown>;
    importedAt: Date;
    actor: Actor;
  },
): Promise<boolean> {
  const actorStamp = { kind: contact.actor.kind, id: contact.actor.id };
  const result = await db
    .insertInto('contacts')
    .values({
      id: contact.id,
      account_id: contact.accountId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      language: contact.language,
      custom: JSON.stringify(contact.custom),
      imported_at: contact.importedAt,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) => conflict.doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}
