import type { SetupStepStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `setup_steps` table (one row per business and step, only once the owner has marked it). Every query names
// the business as well as the step (defence in depth: the database also fences every query by business).

/** What the owner has marked, by step key. */
export async function listMarkedSteps(db: Db, accountId: string): Promise<Map<string, SetupStepStatus>> {
  const rows = await db
    .selectFrom('setup_steps')
    .select(['step_key', 'status'])
    .where('account_id', '=', accountId)
    .execute();
  return new Map(rows.map((row) => [row.step_key, row.status]));
}

/**
 * Locks the owner's mark on one step until the end of the transaction, and returns its status. Two managers marking the same
 * step at the same moment take turns. Undefined when the step has never been marked.
 */
export async function lockMarkedStep(db: Db, accountId: string, stepKey: string): Promise<SetupStepStatus | undefined> {
  const row = await db
    .selectFrom('setup_steps')
    .select('status')
    .where('account_id', '=', accountId)
    .where('step_key', '=', stepKey)
    .forUpdate()
    .executeTakeFirst();
  return row?.status;
}

/** Saves the owner's mark on one step: adds it, or replaces the earlier one. */
export async function saveMarkedStep(
  db: Db,
  options: { accountId: string; stepKey: string; status: SetupStepStatus; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('setup_steps')
    .values({
      account_id: options.accountId,
      step_key: options.stepKey,
      status: options.status,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'step_key']).doUpdateSet({ status: options.status, updated_by: actorStamp }),
    )
    .execute();
}
