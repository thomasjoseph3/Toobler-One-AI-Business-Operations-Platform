import type { PipelineStage, StageKind } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `pipelines` and `pipeline_stages` tables (the columns of the leads board). Every function names the
// business it works for.

/** Turns a person or system into the stamp stored in `created_by` / `updated_by`. */
const toActorStamp = (actor: Actor) => ({ kind: actor.kind, id: actor.id });

/** Adds the business's pipeline. */
export async function insertPipeline(
  db: Db,
  pipeline: { id: string; accountId: string; name: string; actor: Actor },
): Promise<void> {
  await db
    .insertInto('pipelines')
    .values({
      id: pipeline.id,
      account_id: pipeline.accountId,
      name: pipeline.name,
      created_by: toActorStamp(pipeline.actor),
      updated_by: toActorStamp(pipeline.actor),
    })
    .execute();
}

/** Adds a stage to a pipeline. */
export async function insertStage(
  db: Db,
  stage: {
    id: string;
    accountId: string;
    pipelineId: string;
    name: string;
    sort: number;
    kind: StageKind;
    actor: Actor;
  },
): Promise<void> {
  await db
    .insertInto('pipeline_stages')
    .values({
      id: stage.id,
      account_id: stage.accountId,
      pipeline_id: stage.pipelineId,
      name: stage.name,
      sort: stage.sort,
      kind: stage.kind,
      created_by: toActorStamp(stage.actor),
      updated_by: toActorStamp(stage.actor),
    })
    .execute();
}

/** The business's pipeline (id and name), or undefined if it has none. */
export async function findPipelineForAccount(
  db: Db,
  accountId: string,
): Promise<{ id: string; name: string } | undefined> {
  return db.selectFrom('pipelines').select(['id', 'name']).where('account_id', '=', accountId).executeTakeFirst();
}

/**
 * Like findPipelineForAccount, but also locks the pipeline row until the transaction ends, so two managers changing the
 * stages at the same moment take turns instead of both reading the same order.
 */
export async function lockPipelineForAccount(
  db: Db,
  accountId: string,
): Promise<{ id: string; name: string } | undefined> {
  return db
    .selectFrom('pipelines')
    .select(['id', 'name'])
    .where('account_id', '=', accountId)
    .forUpdate()
    .executeTakeFirst();
}

/** Every stage of the pipeline in board order, each with the number of leads in it (deleted leads are not counted). */
export async function listStagesWithLeadCounts(
  db: Db,
  accountId: string,
  pipelineId: string,
): Promise<PipelineStage[]> {
  const rows = await db
    .selectFrom('pipeline_stages as stage')
    .leftJoin('leads as lead', (join) => join.onRef('lead.stage_id', '=', 'stage.id').on('lead.deleted_at', 'is', null))
    .select(['stage.id', 'stage.name', 'stage.kind', 'stage.sort'])
    .select((expression) => expression.fn.count<string>('lead.id').as('lead_count'))
    .where('stage.account_id', '=', accountId)
    .where('stage.pipeline_id', '=', pipelineId)
    .groupBy(['stage.id', 'stage.name', 'stage.kind', 'stage.sort'])
    .orderBy('stage.sort')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    sort: row.sort,
    leadCount: Number(row.lead_count),
  }));
}

/** How many open stages (not Won or Lost) the pipeline has. */
export async function countOpenStages(db: Db, accountId: string, pipelineId: string): Promise<number> {
  const countRow = await db
    .selectFrom('pipeline_stages')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('pipeline_id', '=', pipelineId)
    .where('kind', '=', 'open')
    .executeTakeFirstOrThrow();
  return Number(countRow.total);
}

/** The place on the board where the Won stage sits now, which is where a new open stage goes. */
export async function findWonStageSort(db: Db, accountId: string, pipelineId: string): Promise<number | undefined> {
  const row = await db
    .selectFrom('pipeline_stages')
    .select('sort')
    .where('account_id', '=', accountId)
    .where('pipeline_id', '=', pipelineId)
    .where('kind', '=', 'won')
    .executeTakeFirst();
  return row?.sort;
}

/** Moves Won and Lost one place to the right, to make room for a new open stage in front of them. */
export async function shiftClosingStagesRight(
  db: Db,
  options: { accountId: string; pipelineId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('pipeline_stages')
    .set((expression) => ({
      sort: expression('sort', '+', 1),
      updated_by: toActorStamp(options.actor),
      updated_at: new Date(),
    }))
    .where('account_id', '=', options.accountId)
    .where('pipeline_id', '=', options.pipelineId)
    .where('kind', 'in', ['won', 'lost'])
    .execute();
}

/** One stage of the business (its id, pipeline and kind), or undefined (also for another business's stage). */
export async function findStageById(
  db: Db,
  accountId: string,
  stageId: string,
): Promise<{ id: string; pipelineId: string; kind: StageKind } | undefined> {
  const row = await db
    .selectFrom('pipeline_stages')
    .select(['id', 'pipeline_id', 'kind'])
    .where('account_id', '=', accountId)
    .where('id', '=', stageId)
    .executeTakeFirst();
  return row ? { id: row.id, pipelineId: row.pipeline_id, kind: row.kind } : undefined;
}

/** Gives a stage a new name. */
export async function renameStage(
  db: Db,
  options: { accountId: string; stageId: string; name: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('pipeline_stages')
    .set({ name: options.name, updated_by: toActorStamp(options.actor), updated_at: new Date() })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.stageId)
    .execute();
}

/** The ids of the pipeline's open stages, in board order. */
export async function listOpenStageIds(db: Db, accountId: string, pipelineId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('pipeline_stages')
    .select('id')
    .where('account_id', '=', accountId)
    .where('pipeline_id', '=', pipelineId)
    .where('kind', '=', 'open')
    .orderBy('sort')
    .execute();
  return rows.map((row) => row.id);
}

/** Puts a stage at a place on the board. */
export async function setStageSort(
  db: Db,
  options: { accountId: string; stageId: string; sort: number; actor: Actor },
): Promise<void> {
  await db
    .updateTable('pipeline_stages')
    .set({ sort: options.sort, updated_by: toActorStamp(options.actor), updated_at: new Date() })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.stageId)
    .execute();
}

/** Puts the Won and Lost stages at the two places after the open stages, whatever they were before. */
export async function placeClosingStagesAt(
  db: Db,
  options: { accountId: string; pipelineId: string; firstPlace: number; actor: Actor },
): Promise<void> {
  const closingStages = await db
    .selectFrom('pipeline_stages')
    .select(['id', 'kind'])
    .where('account_id', '=', options.accountId)
    .where('pipeline_id', '=', options.pipelineId)
    .where('kind', 'in', ['won', 'lost'])
    .execute();
  for (const stage of closingStages) {
    await setStageSort(db, {
      accountId: options.accountId,
      stageId: stage.id,
      sort: stage.kind === 'won' ? options.firstPlace : options.firstPlace + 1,
      actor: options.actor,
    });
  }
}

/** Removes a stage for good. Its leads must have been moved away first. */
export async function deleteStage(db: Db, accountId: string, stageId: string): Promise<void> {
  await db.deleteFrom('pipeline_stages').where('account_id', '=', accountId).where('id', '=', stageId).execute();
}

/** The ids of the open stages of the pipeline, in board order, except one. */
export async function listOpenStageIdsExcept(
  db: Db,
  accountId: string,
  pipelineId: string,
  exceptStageId: string,
): Promise<string[]> {
  const openStageIds = await listOpenStageIds(db, accountId, pipelineId);
  return openStageIds.filter((stageId) => stageId !== exceptStageId);
}
