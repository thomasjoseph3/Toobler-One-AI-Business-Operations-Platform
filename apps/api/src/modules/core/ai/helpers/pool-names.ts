import type { LlmProviderId } from '../../../../providers/llm';

// The in-memory key pools are found by name. The call service (which uses them) and the status view (which reports which keys are
// resting) must use the same name, so it is written once, here. Names are made of ids, never of key text.

/** The name of the pool of one business's own keys for one company. It changes when the list of keys changes. */
export function ownKeyPoolName(accountId: string, provider: LlmProviderId, keyIds: string[]): string {
  return `own:${accountId}:${provider}:${keyIds.join(',')}`;
}
