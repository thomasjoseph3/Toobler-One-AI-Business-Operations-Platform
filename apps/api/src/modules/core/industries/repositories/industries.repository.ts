import type { Db } from '../../../../kernel/database';

// The SQL for the `industries` table (the kinds of business a person can pick). The only file in this module that talks
// to the database. The table is shared by every business, so these queries are not fenced to one.

/** An industry as the rest of the app sees it. */
export interface IndustryRow {
  id: string;
  label: string;
}

/** The industries that are switched on, in the order they should be shown (sort order first, then label). */
export async function findActiveIndustries(db: Db): Promise<IndustryRow[]> {
  return db
    .selectFrom('industries')
    .select(['id', 'label'])
    .where('is_active', '=', true)
    .orderBy('sort_order')
    .orderBy('label')
    .execute();
}

/** Adds an industry. It starts switched on. The database refuses an id that already exists. */
export async function insertIndustry(
  db: Db,
  industry: { id: string; label: string; sortOrder: number },
): Promise<void> {
  await db
    .insertInto('industries')
    .values({ id: industry.id, label: industry.label, sort_order: industry.sortOrder })
    .execute();
}

/** Whether an industry with this id exists and is switched on. */
export async function isActiveIndustryId(db: Db, industryId: string): Promise<boolean> {
  const row = await db
    .selectFrom('industries')
    .select('id')
    .where('id', '=', industryId)
    .where('is_active', '=', true)
    .executeTakeFirst();
  return row !== undefined;
}
