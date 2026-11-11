import type { Db } from '../../../../kernel/database';
import type { Actor } from '../../../../kernel/context';
import type { StoredModule } from '../helpers/module-state';

// The SQL for the `account_modules` table (which modules a business has). Every function names the business it works on,
// so it is right both inside a business's fence and on the owner connection (used by the platform).

/** Turns a database row into a StoredModule. */
function toStoredModule(row: { module_id: string; entitled: boolean; enabled: boolean }): StoredModule {
  return { moduleId: row.module_id, entitled: row.entitled, enabled: row.enabled };
}

/** The business's module rows. */
export async function listModules(db: Db, accountId: string): Promise<StoredModule[]> {
  const rows = await db
    .selectFrom('account_modules')
    .select(['module_id', 'entitled', 'enabled'])
    .where('account_id', '=', accountId)
    .execute();
  return rows.map(toStoredModule);
}

/** The business's module rows, locked until the transaction ends, so two switches at once cannot undo each other. */
export async function listModulesForUpdate(db: Db, accountId: string): Promise<StoredModule[]> {
  const rows = await db
    .selectFrom('account_modules')
    .select(['module_id', 'entitled', 'enabled'])
    .where('account_id', '=', accountId)
    .forUpdate()
    .execute();
  return rows.map(toStoredModule);
}

/** Switches the listed modules on or off and stamps when. Only the columns the app role may change are touched. */
export async function setModulesEnabled(
  db: Db,
  accountId: string,
  moduleIds: readonly string[],
  enabled: boolean,
  actor: Actor,
): Promise<void> {
  if (moduleIds.length === 0) return;
  const now = new Date();
  await db
    .updateTable('account_modules')
    .set({
      enabled,
      ...(enabled ? { enabled_at: now } : { disabled_at: now }),
      updated_by: { kind: actor.kind, id: actor.id },
    })
    .where('account_id', '=', accountId)
    .where('module_id', 'in', [...moduleIds])
    .execute();
}

/**
 * OWNER CONNECTION ONLY (the app role may not do this on purpose): puts a module into a business's plan, or takes it out
 * again. Taking it out also switches it off. Used at sign-up for the starting modules and by the platform route.
 * Fails with a foreign-key error when the business does not exist.
 */
export async function setEntitlement(
  db: Db,
  row: { accountId: string; moduleId: string; entitled: boolean; enabled: boolean; actor: Actor },
): Promise<void> {
  const actor = { kind: row.actor.kind, id: row.actor.id };
  const now = new Date();
  await db
    .insertInto('account_modules')
    .values({
      account_id: row.accountId,
      module_id: row.moduleId,
      entitled: row.entitled,
      enabled: row.enabled,
      enabled_at: row.enabled ? now : null,
      created_by: actor,
      updated_by: actor,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'module_id']).doUpdateSet({
        entitled: row.entitled,
        // Out of the plan always means off; into the plan keeps the business's own choice
        ...(row.entitled ? {} : { enabled: false, disabled_at: now }),
        updated_by: actor,
      }),
    )
    .execute();
}
