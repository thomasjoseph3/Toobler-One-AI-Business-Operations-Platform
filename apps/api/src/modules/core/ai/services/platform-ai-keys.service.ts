import type { PlatformAiKey, PlatformAiKeysResponse } from '@toobler-one/shared';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { LLM_PROVIDER_IDS, poolFor } from '../../../../providers/llm';
import { findAllChecks } from '../repositories/ai-platform-key-checks.repository';

/**
 * The health of the platform's own AI keys (the ones in the server's settings), for the Toobler team. Shows each key by its place in
 * the list: never the key. The status comes from the daily check; a key it has not looked at yet is `unchecked`. A key this running
 * copy of the API is resting after a limit shows when it comes back.
 */
export function createPlatformAiKeysService({
  database,
  config,
  now = () => new Date(),
}: {
  database: Database;
  config: Config;
  now?: () => Date;
}) {
  return {
    async listKeys(): Promise<PlatformAiKeysResponse> {
      const checks = await findAllChecks(database.system);
      const items: PlatformAiKey[] = [];
      const keysPerProvider: Record<string, number> = {};
      for (const provider of LLM_PROVIDER_IDS) {
        const keys = config.ai.platformKeys[provider];
        keysPerProvider[provider] = keys.length;
        const resting = poolFor(keys).restingUntil();
        for (let position = 1; position <= keys.length; position += 1) {
          const check = checks.find((stored) => stored.provider === provider && stored.keyPosition === position);
          const restingFor = resting.filter(
            (entry) => entry.position === position && entry.until.getTime() > now().getTime(),
          );
          const latestRest = Math.max(0, ...restingFor.map((entry) => entry.until.getTime()));
          items.push({
            provider,
            keyPosition: position,
            status: check?.status ?? 'unchecked',
            statusNote: check?.statusNote ?? null,
            checkedAt: check ? check.checkedAt.toISOString() : null,
            restingUntil: latestRest === 0 ? null : new Date(latestRest).toISOString(),
          });
        }
      }
      return { items, keysPerProvider };
    },
  };
}
