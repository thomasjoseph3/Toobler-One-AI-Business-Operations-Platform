import type { LlmCandidate, LlmKeySource, LlmProvider, LlmProviderId } from '../../../../providers/llm';
import { LlmAllAttemptsFailedError } from '../../../../providers/llm';
import type { CatalogueModel } from '../helpers/choose-models-for-task';
import { chooseModelsToTestKey } from '../helpers/choose-models-to-test-key';
import { findingWhenKeyFails, findingWhenKeyWorks, type KeyTestFinding } from '../helpers/key-test-result';

/** What testing one key found, and (when it worked) which model answered and how fast. */
export interface KeyTestOutcome {
  finding: KeyTestFinding;
  modelName: string | null;
  latencyMs: number | null;
}

/**
 * Tests one key with a tiny real call ("reply with the single word OK") to its own company, trying up to three of the company's
 * models. Used by the Test button and by the daily check, so they always judge a key the same way. The key is held only for the call.
 */
export async function testKeyWithModels(options: {
  llm: LlmProvider;
  catalogue: CatalogueModel[];
  provider: LlmProviderId;
  plainKey: string;
  keySource: LlmKeySource;
  keyPosition: number;
}): Promise<KeyTestOutcome> {
  const candidates: LlmCandidate[] = chooseModelsToTestKey(options.catalogue, options.provider).map((model) => ({
    provider: model.provider,
    modelName: model.modelName,
    apiKey: options.plainKey,
    keySource: options.keySource,
    keyPosition: options.keyPosition,
  }));
  if (candidates.length === 0) return { finding: findingWhenKeyFails([]), modelName: null, latencyMs: null };
  try {
    const answer = await options.llm.generateText({
      tag: { task: 'key_test', agentId: 'key-test', channel: 'internal', promptVersion: 'key-test-1' },
      candidates,
      prompt: {
        stableSystemText: 'You are a connection test. Reply with the single word OK.',
        messages: [{ role: 'user', text: 'ping' }],
      },
      maxOutputTokens: 200,
    });
    return {
      finding: findingWhenKeyWorks(answer.details.servedBy.modelName, answer.details.latencyMs),
      modelName: answer.details.servedBy.modelName,
      latencyMs: answer.details.latencyMs,
    };
  } catch (error) {
    if (!(error instanceof LlmAllAttemptsFailedError)) throw error;
    return { finding: findingWhenKeyFails(error.attempts), modelName: null, latencyMs: null };
  }
}
