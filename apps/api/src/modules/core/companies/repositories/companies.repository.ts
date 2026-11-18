import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `companies` table (firms, schools, families and groups that contacts belong to). Every function names the business it works for, and
// only ever sees companies that are not deleted. Run each inside the business's fence.

/** The columns every read returns. */
const COMPANY_COLUMNS = ['id', 'name', 'domain', 'phone', 'city', 'owner_user_id', 'created_at', 'updated_at'] as const;

/** A company as stored (the numbers about its people are added by the service). */
export interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  city: string | null;
  ownerUserId: string | null;
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
  options: { searchPattern: string | undefined; domain: string | undefined; limit: number; offset: number },
): Promise<{ items: CompanyRow[]; total: number }> {
  /** The filters shared by the page query and the count query. */
  const filtered = () => {
    let query = db.selectFrom('companies').where('account_id', '=', accountId).where('deleted_at', 'is', null);
    if (options.domain) query = query.where('domain', '=', options.domain);
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
