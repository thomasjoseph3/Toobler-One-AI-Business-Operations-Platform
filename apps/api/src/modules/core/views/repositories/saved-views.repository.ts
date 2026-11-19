import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `saved_views` table. Every function names the business. Run each inside the business's fence.

/** A saved view as the database holds it. */
export interface SavedViewRow {
  id: string;
  object: 'lead';
  name: string;
  filters: Record<string, unknown>;
  sortField: string | null;
  sortOrder: 'asc' | 'desc' | null;
  layout: 'list' | 'pipeline';
  ownerUserId: string;
  shared: boolean;
}

const VIEW_COLUMNS = [
  'id',
  'object',
  'name',
  'filters',
  'sort_field',
  'sort_order',
  'layout',
  'owner_user_id',
  'shared',
] as const;

/** Turns a database row into a SavedViewRow. */
function toSavedViewRow(row: {
  id: string;
  object: 'lead';
  name: string;
  filters: Record<string, unknown>;
  sort_field: string | null;
  sort_order: 'asc' | 'desc' | null;
  layout: 'list' | 'pipeline';
  owner_user_id: string;
  shared: boolean;
}): SavedViewRow {
  return {
    id: row.id,
    object: row.object,
    name: row.name,
    filters: row.filters,
    sortField: row.sort_field,
    sortOrder: row.sort_order,
    layout: row.layout,
    ownerUserId: row.owner_user_id,
    shared: row.shared,
  };
}

/** The views one person may see for a list: their own and the ones shared with the team, oldest first (so the tabs keep their places). */
export async function listViewsVisibleTo(
  db: Db,
  options: { accountId: string; object: 'lead'; userId: string },
): Promise<SavedViewRow[]> {
  const rows = await db
    .selectFrom('saved_views')
    .select(VIEW_COLUMNS)
    .where('account_id', '=', options.accountId)
    .where('object', '=', options.object)
    .where((condition) =>
      condition.or([condition('owner_user_id', '=', options.userId), condition('shared', '=', true)]),
    )
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map(toSavedViewRow);
}

/** How many views of this list one person has saved (their own, shared or not). */
export async function countViewsOwnedBy(
  db: Db,
  options: { accountId: string; object: 'lead'; userId: string },
): Promise<number> {
  const row = await db
    .selectFrom('saved_views')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', options.accountId)
    .where('object', '=', options.object)
    .where('owner_user_id', '=', options.userId)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** Adds a view and returns it. Throws a unique-violation (23505) when the person already has a view of this list with this name. */
export async function insertSavedView(
  db: Db,
  view: {
    id: string;
    accountId: string;
    object: 'lead';
    name: string;
    filters: Record<string, unknown>;
    sortField: string | null;
    sortOrder: 'asc' | 'desc' | null;
    layout: 'list' | 'pipeline';
    ownerUserId: string;
    actor: Actor;
  },
): Promise<SavedViewRow> {
  const actorStamp = { kind: view.actor.kind, id: view.actor.id };
  const row = await db
    .insertInto('saved_views')
    .values({
      id: view.id,
      account_id: view.accountId,
      object: view.object,
      name: view.name,
      filters: JSON.stringify(view.filters),
      sort_field: view.sortField,
      sort_order: view.sortOrder,
      layout: view.layout,
      owner_user_id: view.ownerUserId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(VIEW_COLUMNS)
    .executeTakeFirstOrThrow();
  return toSavedViewRow(row);
}

/** One view of the business by its id (whoever owns it), or undefined (also for another business's view). The service decides who may see or change it. */
export async function findSavedViewById(db: Db, accountId: string, viewId: string): Promise<SavedViewRow | undefined> {
  const row = await db
    .selectFrom('saved_views')
    .select(VIEW_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', viewId)
    .executeTakeFirst();
  return row === undefined ? undefined : toSavedViewRow(row);
}

/** Changes the editable parts of a view (only what is given) and returns it, or undefined when there is no such view. Throws a unique-violation (23505) on a name already used by the owner. */
export async function updateSavedView(
  db: Db,
  options: {
    accountId: string;
    viewId: string;
    changes: {
      name?: string;
      shared?: boolean;
      filters?: Record<string, unknown>;
      sortField?: string | null;
      sortOrder?: 'asc' | 'desc' | null;
      layout?: 'list' | 'pipeline';
    };
    actor: Actor;
  },
): Promise<SavedViewRow | undefined> {
  const { changes } = options;
  const row = await db
    .updateTable('saved_views')
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.shared !== undefined ? { shared: changes.shared } : {}),
      ...(changes.filters !== undefined ? { filters: JSON.stringify(changes.filters) } : {}),
      ...(changes.sortField !== undefined ? { sort_field: changes.sortField } : {}),
      ...(changes.sortOrder !== undefined ? { sort_order: changes.sortOrder } : {}),
      ...(changes.layout !== undefined ? { layout: changes.layout } : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.viewId)
    .returning(VIEW_COLUMNS)
    .executeTakeFirst();
  return row === undefined ? undefined : toSavedViewRow(row);
}

/** Deletes a view for good (a view is only a saved set of words, not history). Returns false when there is no such view. */
export async function deleteSavedView(db: Db, accountId: string, viewId: string): Promise<boolean> {
  const row = await db
    .deleteFrom('saved_views')
    .where('account_id', '=', accountId)
    .where('id', '=', viewId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
