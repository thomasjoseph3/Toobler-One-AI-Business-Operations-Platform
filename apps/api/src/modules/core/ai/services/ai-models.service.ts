import type { AiModelsResponse } from '@toobler-one/shared';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { LLM_PROVIDER_IDS, type LlmProviderId } from '../../../../providers/llm';
import { AI_TASKS } from '../helpers/ai-tasks';
import { chooseModelsForTask, chooseOrderForTask } from '../helpers/choose-models-for-task';
import { decideKeySources } from '../helpers/decide-key-sources';
import { findAllModels, findModelOrderPerTask } from '../repositories/ai-models.repository';
import { loadAiAccess } from './ai-access.service';

/**
 * The jobs, the models, and for each job the models that would answer it today for THIS business (best first). A model is
 * "available" when a key it could be answered with exists for the business: its own key of that company (in a mode that uses own
 * keys), or the platform's key (in a mode that uses them, switched on and before the end date). Nothing secret is returned.
 */
export async function listAiModels(database: Database, config: Config, accountId: string): Promise<AiModelsResponse> {
  const catalogue = await findAllModels(database.system);
  const platformOrderPerTask = await findModelOrderPerTask(database.system);
  const access = await loadAiAccess(database, accountId);
  const sources = decideKeySources({
    keyMode: access.keyMode,
    platformEnabled: access.platformEnabled,
    platformExpiresAt: access.platformExpiresAt,
    platformMonthlyCallCap: access.platformMonthlyCallCap,
    platformCallsThisMonth: access.platformCallsThisMonth,
    now: new Date(),
  });

  const providersWithKeys = new Set<LlmProviderId>();
  for (const provider of LLM_PROVIDER_IDS) {
    const hasOwnKey = sources.useOwn && (access.ownKeysByProvider.get(provider)?.length ?? 0) > 0;
    const hasPlatformKey = sources.usePlatform && config.ai.platformKeys[provider].length > 0;
    if (hasOwnKey || hasPlatformKey) providersWithKeys.add(provider);
  }

  const configuredOrder: Record<string, string[]> = {};
  const order: Record<string, string[]> = {};
  for (const task of AI_TASKS) {
    const orderedModelIds = chooseOrderForTask({
      businessTaskModels: access.taskModels,
      platformOrderPerTask,
      taskId: task.id,
    });
    configuredOrder[task.id] = orderedModelIds;
    order[task.id] = chooseModelsForTask({ catalogue, orderedModelIds, providersWithKeys }).map((model) => model.id);
  }
  return {
    tasks: AI_TASKS.map((task) => ({ id: task.id, label: task.label, description: task.description })),
    models: catalogue.map((model) => ({
      id: model.id,
      provider: model.provider,
      modelName: model.modelName,
      label: model.label,
      tasks: model.tasks,
      status: model.status,
      kind: model.kind,
      size: model.size,
      isAlias: model.isAlias,
      retiresOn: model.retiresOn,
      available: providersWithKeys.has(model.provider),
    })),
    configuredOrder,
    order,
  };
}
