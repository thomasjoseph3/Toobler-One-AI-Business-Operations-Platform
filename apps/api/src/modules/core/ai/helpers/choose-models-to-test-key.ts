import type { LlmProviderId } from '../../../../providers/llm';
import type { CatalogueModel } from './choose-models-for-task';

// Which models to try when testing one key. A key belongs to one AI company, so only that company's models can answer.

/** How many models a test tries before giving up. Each try may take up to 30 seconds, so this keeps a test short. */
export const MAX_MODELS_TRIED_WHEN_TESTING = 3;

/**
 * The models to try for a key of this company, best first: active text models by the platform's display order, then deprecated
 * ones. Retired models and voice models are never tried. At most MAX_MODELS_TRIED_WHEN_TESTING.
 */
export function chooseModelsToTestKey(catalogue: CatalogueModel[], provider: LlmProviderId): CatalogueModel[] {
  const usable = catalogue.filter(
    (model) => model.provider === provider && model.kind === 'text' && model.status !== 'retired',
  );
  const statusRank = (model: CatalogueModel) => (model.status === 'active' ? 0 : 1);
  return [...usable]
    .sort((first, second) => statusRank(first) - statusRank(second) || first.sortOrder - second.sortOrder)
    .slice(0, MAX_MODELS_TRIED_WHEN_TESTING);
}
