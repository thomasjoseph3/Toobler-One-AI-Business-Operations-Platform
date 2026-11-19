import type { LlmProviderId } from '../../../../providers/llm';
import type { CatalogueModel } from './choose-models-for-task';

// Pure rules for watching the AI models: which of ours has vanished from a company's list, which new ones a company now offers, and
// whether a model's retirement date is close enough to warn about. No database and no network.

/**
 * Our active or deprecated text models of this company that the company's own list no longer shows. (The list alone never proves
 * a model works; but a model that has left the list is certainly gone or going.)
 */
export function findMissingModels(
  catalogue: CatalogueModel[],
  provider: LlmProviderId,
  providerModelNames: readonly string[],
): CatalogueModel[] {
  const listed = new Set(providerModelNames);
  return catalogue.filter(
    (model) =>
      model.provider === provider &&
      model.kind === 'text' &&
      model.status !== 'retired' &&
      !listed.has(model.modelName),
  );
}

// What an ordinary chat model of each company is called. Anything else in a company's list (dated copies, previews, image, voice,
// embedding and tool-specific models) is not suggested.
const CHAT_MODEL_NAME_PATTERN: Record<LlmProviderId, RegExp> = {
  gemini: /^gemini-\d+(\.\d+)?-(flash|pro)(-lite)?$/,
  openai: /^gpt-\d+(\.\d+)?o?(-(mini|nano))?$/,
  anthropic: /^claude-(haiku|sonnet|opus)-\d+(-\d+)?$/,
};

/** The most new models one warning suggests. */
export const MAX_NEW_MODEL_SUGGESTIONS = 10;

/** Ordinary chat models a company now offers that are not in our list yet, sorted by name, at most MAX_NEW_MODEL_SUGGESTIONS. */
export function findNewModelCandidates(
  provider: LlmProviderId,
  providerModelNames: readonly string[],
  knownModelNames: ReadonlySet<string>,
): string[] {
  return [...new Set(providerModelNames)]
    .filter((name) => CHAT_MODEL_NAME_PATTERN[provider].test(name) && !knownModelNames.has(name))
    .sort()
    .slice(0, MAX_NEW_MODEL_SUGGESTIONS);
}

/** How close a model's retirement is: within 30 days, within 7, or already past. Null when it is further away or there is no date. */
export type RetirementWarning = '30_days' | '7_days' | 'passed';

const MILLISECONDS_PER_DAY = 86_400_000;

/** Which retirement warning (if any) is due for a model retiring on this day (like 2027-03-31). Days are UTC. */
export function retirementWarningDue(retiresOn: string | null, now: Date): RetirementWarning | null {
  if (retiresOn === null) return null;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const daysLeft = Math.round((Date.parse(`${retiresOn}T00:00:00Z`) - today) / MILLISECONDS_PER_DAY);
  if (daysLeft <= 0) return 'passed';
  if (daysLeft <= 7) return '7_days';
  if (daysLeft <= 30) return '30_days';
  return null;
}
