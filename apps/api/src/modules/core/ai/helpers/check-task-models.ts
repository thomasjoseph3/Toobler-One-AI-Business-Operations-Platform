import { AI_TASK_IDS } from './ai-tasks';
import type { CatalogueModel } from './choose-models-for-task';

// Pure check of a business's own model order before it is saved. Returns the problems in plain words (empty when it is fine).

/** The problems with a set of per-job model orders: an unknown job, an unknown / retired / voice model, or the same model twice. */
export function findProblemsInTaskModels(catalogue: CatalogueModel[], taskModels: Record<string, string[]>): string[] {
  const modelsById = new Map(catalogue.map((model) => [model.id, model]));
  const problems: string[] = [];
  for (const [taskId, modelIds] of Object.entries(taskModels)) {
    if (!AI_TASK_IDS.includes(taskId)) {
      problems.push(`"${taskId}" is not a job the AI does`);
      continue;
    }
    if (new Set(modelIds).size !== modelIds.length) problems.push(`${taskId}: the same model is listed twice`);
    for (const modelId of modelIds) {
      const model = modelsById.get(modelId);
      if (!model) problems.push(`${taskId}: there is no model with the id ${modelId}`);
      else if (model.status === 'retired') problems.push(`${taskId}: ${model.modelName} is retired and cannot be used`);
      else if (model.kind !== 'text')
        problems.push(`${taskId}: ${model.modelName} is a voice model and cannot do this job`);
    }
  }
  return problems;
}
