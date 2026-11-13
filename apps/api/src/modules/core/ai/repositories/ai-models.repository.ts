import type { Db } from '../../../../kernel/database';
import type { CatalogueModel } from '../helpers/choose-models-for-task';

// The SQL for the `ai_models` and `ai_task_models` tables (the AI models the platform knows about, and which of them do which
// job). The only file in this module that talks to the database. The tables are shared by every business, so these queries
// are not fenced to one.

/** Every model in the list, in the platform's display order. */
export async function findAllModels(db: Db): Promise<CatalogueModel[]> {
  const rows = await db
    .selectFrom('ai_models')
    .select([
      'id',
      'provider',
      'model_name',
      'label',
      'tasks',
      'status',
      'kind',
      'size',
      'is_alias',
      'retires_on',
      'sort_order',
    ])
    .orderBy('sort_order')
    .orderBy('model_name')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    modelName: row.model_name,
    label: row.label,
    tasks: row.tasks,
    status: row.status,
    kind: row.kind,
    size: row.size,
    isAlias: row.is_alias,
    retiresOn: row.retires_on,
    sortOrder: row.sort_order,
  }));
}

/** For each job, the ids of the models set for it, in order (the preset or the platform's setting). */
export async function findModelOrderPerTask(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .selectFrom('ai_task_models')
    .select(['task', 'model_id'])
    .orderBy('task')
    .orderBy('position')
    .execute();
  const orderPerTask = new Map<string, string[]>();
  for (const row of rows) {
    const modelIds = orderPerTask.get(row.task) ?? [];
    modelIds.push(row.model_id);
    orderPerTask.set(row.task, modelIds);
  }
  return orderPerTask;
}
