import { sql } from 'kysely';
import type { CheckedFilterCondition } from '@toobler-one/shared';
import { conditionsToSql } from '../../../../kernel/filters/conditions-to-sql';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `companies` table (firms, schools, families and groups that contacts belong to). Every function names the business it works for, and
// only ever sees companies that are not deleted. Run each inside the business's fence.

/** The columns every read returns. */
const COMPANY_COLUMNS = [
  'id',
  'name',
  'domain',
  'phone',
  'city',
  'owner_user_id',
  'custom',
  'created_at',
  'updated_at',
] as const;

/** A company as stored (the numbers about its people are added by the service). */
export interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  city: string | null;
  ownerUserId: string | null;
  /** The stored answers to custom fields, removed fields' answers included (the service hides those). */
  custom: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a database row into a CompanyRow. */
function toCompanyRow(row: {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  city: string | null;
  owner_user_id: string | null;
  custom: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}): CompanyRow {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    phone: row.phone,
    city: row.city,
    ownerUserId: row.owner_user_id,
    custom: row.custom,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Adds a company and returns it. Throws a unique-violation (23505) when a live company already has the name (ignoring capitals and spaces) or the domain. */
export async function insertCompany(
  db: Db,
  company: {
    id: string;
    accountId: string;
    name: string;
    domain: string | null;
    phone: string | null;
    city: string | null;
    ownerUserId: string | null;
    custom: Record<string, unknown>;
    actor: Actor;
  },
): Promise<CompanyRow> {
  const actorStamp = { kind: company.actor.kind, id: company.actor.id };
  const row = await db
    .insertInto('companies')
    .values({
      id: company.id,
      account_id: company.accountId,
      name: company.name,
      domain: company.domain,
      phone: company.phone,
      city: company.city,
      owner_user_id: company.ownerUserId,
      custom: JSON.stringify(company.custom),
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(COMPANY_COLUMNS)
    .executeTakeFirstOrThrow();
  return toCompanyRow(row);
}

/** The id of the live company that has this name key (name without capitals and spaces), or undefined. */
export async function findCompanyIdByNameKey(db: Db, accountId: string, nameKey: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('companies')
    .select('id')
    .where('account_id', '=', accountId)
    .where('name_key', '=', nameKey)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.id;
}

/** The id of the live company that has this work domain, or undefined. */
export async function findCompanyIdByDomain(db: Db, accountId: string, domain: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('companies')
    .select('id')
    .where('account_id', '=', accountId)
    .where('domain', '=', domain)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.id;
}

/** One page of the business's companies, newest change first, plus how many there are in all (for the same search). */
export async function listCompanies(
  db: Db,
  accountId: string,
  options: {
    searchPattern: string | undefined;
    domain: string | undefined;
    /** Filter-engine conditions that already passed the shared check; every one must hold. */
    conditions?: readonly CheckedFilterCondition[];
    limit: number;
    offset: number;
  },
): Promise<{ items: CompanyRow[]; total: number }> {
  /** The filters shared by the page query and the count query. */
  const filtered = () => {
    let query = db.selectFrom('companies').where('account_id', '=', accountId).where('deleted_at', 'is', null);
    if (options.domain) query = query.where('domain', '=', options.domain);
    const conditionSql = conditionsToSql(options.conditions ?? [], { customColumn: 'custom', builtInColumns: {} });
    if (conditionSql) query = query.where(conditionSql);
    const pattern = options.searchPattern;
    if (pattern) {
      query = query.where((expression) =>
        expression.or([
          expression('name', 'ilike', pattern),
          expression('domain', 'ilike', pattern),
          expression('city', 'ilike', pattern),
        ]),
      );
    }
    return query;
  };
  const rows = await filtered()
    .select(COMPANY_COLUMNS)
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  const countRow = await filtered()
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return { items: rows.map(toCompanyRow), total: Number(countRow.total) };
}

/** One live company of the business, or undefined (also for a deleted company and another business's company). */
export async function findCompanyById(db: Db, accountId: string, companyId: string): Promise<CompanyRow | undefined> {
  const row = await db
    .selectFrom('companies')
    .select(COMPANY_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', companyId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toCompanyRow(row) : undefined;
}

/** Like findCompanyById, but locks the row until the transaction ends, so two edits at once cannot overwrite each other. */
export async function findCompanyForUpdate(
  db: Db,
  accountId: string,
  companyId: string,
): Promise<CompanyRow | undefined> {
  const row = await db
    .selectFrom('companies')
    .select(COMPANY_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', companyId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  return row ? toCompanyRow(row) : undefined;
}

/** The new values of a company. A key that is left out is not touched; `null` clears the field. */
export interface CompanyChanges {
  name?: string;
  domain?: string | null;
  phone?: string | null;
  city?: string | null;
  ownerUserId?: string | null;
  /** The whole new set of answers (the service merges what was sent into what is stored). */
  custom?: Record<string, unknown>;
}

/**
 * Changes the listed fields of a live company, stamps who did it, and returns the company. Undefined if there is no such live company. Throws a
 * unique-violation (23505) when another live company already has the name or the domain.
 */
export async function updateCompany(
  db: Db,
  accountId: string,
  companyId: string,
  changes: CompanyChanges,
  actor: Actor,
): Promise<CompanyRow | undefined> {
  const row = await db
    .updateTable('companies')
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.domain !== undefined ? { domain: changes.domain } : {}),
      ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
      ...(changes.city !== undefined ? { city: changes.city } : {}),
      ...(changes.ownerUserId !== undefined ? { owner_user_id: changes.ownerUserId } : {}),
      ...(changes.custom !== undefined ? { custom: JSON.stringify(changes.custom) } : {}),
      updated_by: { kind: actor.kind, id: actor.id },
    })
    .where('account_id', '=', accountId)
    .where('id', '=', companyId)
    .where('deleted_at', 'is', null)
    .returning(COMPANY_COLUMNS)
    .executeTakeFirst();
  return row ? toCompanyRow(row) : undefined;
}

/**
 * Soft-deletes a live company: sets `deleted_at` and stamps who did it. The row stays (the app role cannot delete rows); it just stops showing up
 * and frees its name and domain for a new company. Returns false when there is no such live company.
 */
export async function softDeleteCompany(db: Db, accountId: string, companyId: string, actor: Actor): Promise<boolean> {
  const row = await db
    .updateTable('companies')
    .set({ deleted_at: new Date(), updated_by: { kind: actor.kind, id: actor.id } })
    .where('account_id', '=', accountId)
    .where('id', '=', companyId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Gives every live company of a person to another person (when the person leaves the business). Returns how many companies moved. */
export async function handOverCompanies(
  db: Db,
  options: { accountId: string; fromUserId: string; toUserId: string; actor: Actor },
): Promise<number> {
  const rows = await db
    .updateTable('companies')
    .set({ owner_user_id: options.toUserId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('owner_user_id', '=', options.fromUserId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .execute();
  return rows.length;
}

/** Adds a company with only a name, or does nothing when a live company already has the name (ignoring capitals and spaces). Returns the new company's id, or undefined when one already existed. */
export async function insertCompanyIfFree(
  db: Db,
  company: { id: string; accountId: string; name: string; actor: Actor },
): Promise<string | undefined> {
  const actorStamp = { kind: company.actor.kind, id: company.actor.id };
  const row = await db
    .insertInto('companies')
    .values({
      id: company.id,
      account_id: company.accountId,
      name: company.name,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) => conflict.columns(['account_id', 'name_key']).where('deleted_at', 'is', null).doNothing())
    .returning('id')
    .executeTakeFirst();
  return row?.id;
}

/**
 * Deletes one custom field's answer from every company of the business (the purge of a removed field). Records without that answer are not
 * touched. Returns how many records changed.
 */
export async function removeCustomAnswerKey(
  db: Db,
  options: { accountId: string; key: string; actor: Actor },
): Promise<number> {
  const result = await db
    .updateTable('companies')
    .set({
      custom: sql<string>`custom - ${options.key}::text`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where(sql<boolean>`jsonb_exists(custom, ${options.key})`)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

/** The names of the live companies among these ids, by id. A deleted company and another business's company are left out. */
export async function findCompanyNamesByIds(
  db: Db,
  accountId: string,
  companyIds: string[],
): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('companies')
    .select(['id', 'name'])
    .where('account_id', '=', accountId)
    .where('id', 'in', companyIds)
    .where('deleted_at', 'is', null)
    .execute();
  return new Map(rows.map((row) => [row.id, row.name]));
}
