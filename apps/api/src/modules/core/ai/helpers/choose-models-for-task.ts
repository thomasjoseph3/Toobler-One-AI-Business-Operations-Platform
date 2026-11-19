import type { LlmCandidate, LlmKeySource, LlmProviderId } from '../../../../providers/llm';

// Pure rules (no database, no network) that decide WHICH models answer a job and in WHAT order. Kept apart so they can be
// tested on their own.

/** A model from the list, as these rules need it. */
export interface CatalogueModel {
  id: string;
  provider: LlmProviderId;
  modelName: string;
  label: string;
  tasks: string[];
  status: 'active' | 'deprecated' | 'retired';
  kind: 'text' | 'voice';
  size: 'small' | 'medium' | 'large';
  isAlias: boolean;
  /** The date the provider retires it (YYYY-MM-DD), or null. */
  retiresOn: string | null;
  sortOrder: number;
}

/**
 * The models that may answer a job, best first. The job's setting says which models, in which order. A model is left out when
 * it is retired, is not a text model, or its company has no key. A deprecated model still works for now, so it is moved
 * behind the active ones (a last resort); the setting's order decides within each group.
 */
export function chooseModelsForTask(options: {
  catalogue: CatalogueModel[];
  /** The ids of the models set for the job, in order (the preset or the platform's setting). */
  orderedModelIds: readonly string[];
  providersWithKeys: ReadonlySet<LlmProviderId>;
}): CatalogueModel[] {
  const modelsById = new Map(options.catalogue.map((model) => [model.id, model]));
  const inSettingOrder = options.orderedModelIds.flatMap((modelId) => {
    const model = modelsById.get(modelId);
    return model ? [model] : [];
  });
  const usable = inSettingOrder.filter(
    (model) => model.status !== 'retired' && model.kind === 'text' && options.providersWithKeys.has(model.provider),
  );
  // Array.sort is stable, so within each group the setting's order is kept
  const statusRank = (model: CatalogueModel) => (model.status === 'active' ? 0 : 1);
  return [...usable].sort((first, second) => statusRank(first) - statusRank(second));
}

/**
 * The models set for a job, in order: the business's own order if it has one for this job, otherwise the platform's. The
 * business's choice wins for that job only; every other job keeps the platform's setting.
 */
export function chooseOrderForTask(options: {
  businessTaskModels: Record<string, string[]>;
  platformOrderPerTask: ReadonlyMap<string, string[]>;
  taskId: string;
}): string[] {
  return options.businessTaskModels[options.taskId] ?? options.platformOrderPerTask.get(options.taskId) ?? [];
}

/** One key of a company, with its place in the list. */
export interface KeyToTry {
  key: string;
  position: number;
}

/**
 * The things to try, in order: for each model (best first), every key of its company (the pool's order). So every key is
 * tried on the first model, then every key on the next model, as the hotel agent did.
 */
export function buildCandidates(options: {
  models: CatalogueModel[];
  keySource: LlmKeySource;
  keysFor: (provider: LlmProviderId, modelName: string) => KeyToTry[];
}): LlmCandidate[] {
  return options.models.flatMap((model) =>
    options.keysFor(model.provider, model.modelName).map((keyToTry) => ({
      provider: model.provider,
      modelName: model.modelName,
      apiKey: keyToTry.key,
      keySource: options.keySource,
      keyPosition: keyToTry.position,
    })),
  );
}
