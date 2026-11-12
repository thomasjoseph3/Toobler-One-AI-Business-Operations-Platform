import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `leads` table (one enquiry that might become a sale). More functions arrive with the lead routes; for
// now it holds what removing a pipeline stage needs.

/** How many leads are in a stage that are not deleted. */
export async function countLiveLeadsInStage(db: Db, accountId: string, stageId: string): Promise<number> {
  const countRow = await db
    .selectFrom('leads')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('stage_id', '=', stageId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(countRow.total);
}

/**
 * Moves every lead of one stage into another, deleted leads included (a deleted lead still points at its stage, so the
 * stage could not be removed otherwise). A tidy-up of the board is not contact with the customer, so "last activity" is left
 * alone. Returns nothing.
 */
export async function moveAllLeadsToStage(
  db: Db,
  options: { accountId: string; fromStageId: string; toStageId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      stage_id: options.toStageId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
      updated_at: new Date(),
    })
    .where('account_id', '=', options.accountId)
    .where('stage_id', '=', options.fromStageId)
    .execute();
}
