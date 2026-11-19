import type { Db } from '../../../../kernel/database';
import type { CatalogueModel } from '../helpers/choose-models-for-task';
import { findAllModels } from './ai-models.repository';

// The SQL a PLATFORM ADMIN needs to change the list of AI models and each job's order. These tables are shared by every business and
// the app role may only read them, so this runs on the owner connection, reached only by the platform-only routes.

/** The fields of a model that can be written. */
export interface ModelFields {
  label: string;
  tasks: string[];
  status: 'active' | 'deprecated' | 'retired';
  kind: 'text' | 'voice';
  size: 'small' | 'medium' | 'large';
  isAlias: boolean;
  retiresOn: string | null;
  sortOrder: number;
}

/** The whole list of models (same read as the business view). */
export const findAllModelsForAdmin = findAllModels;

/** One model, or undefined. */
export async function findModelById(db: Db, modelId: string): Promise<CatalogueModel | undefined> {
  return (await findAllModels(db)).find((model) => model.id === modelId);
}

/** Adds a model. Fails with a unique error when the company already has a model with that name. Returns the new id. */
export async function insertModel(
  db: Db,
  model: ModelFields & { provider: 'gemini' | 'openai' | 'anthropic'; modelName: string },
): Promise<string> {
  const row = await db
    .insertInto('ai_models')
    .values({
      provider: model.provider,
      model_name: model.modelName,
      label: model.label,
      tasks: model.tasks,
      status: model.status,
      kind: model.kind,
      size: model.size,
      is_alias: model.isAlias,
      retires_on: model.retiresOn,
      sort_order: model.sortOrder,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Changes the fields given on a model. A field left out (undefined) is not touched; `retiresOn: null` clears the date. Returns false when there is no such model. */
export async function updateModel(db: Db, modelId: string, changes: Partial<ModelFields>): Promise<boolean> {
  const columns = {
    ...(changes.label !== undefined ? { label: changes.label } : {}),
    ...(changes.tasks !== undefined ? { tasks: changes.tasks } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.kind !== undefined ? { kind: changes.kind } : {}),
    ...(changes.size !== undefined ? { size: changes.size } : {}),
    ...(changes.isAlias !== undefined ? { is_alias: changes.isAlias } : {}),
    ...(changes.retiresOn !== undefined ? { retires_on: changes.retiresOn } : {}),
    ...(changes.sortOrder !== undefined ? { sort_order: changes.sortOrder } : {}),
  };
  const result = await db.updateTable('ai_models').set(columns).where('id', '=', modelId).executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Replaces the platform's model order for one job with these model ids, best first. */
export async function replaceTaskModels(db: Db, taskId: string, modelIds: string[]): Promise<void> {
  await db.deleteFrom('ai_task_models').where('task', '=', taskId).execute();
  await db
    .insertInto('ai_task_models')
    .values(modelIds.map((modelId, index) => ({ task: taskId, position: index + 1, model_id: modelId })))
    .execute();
}
