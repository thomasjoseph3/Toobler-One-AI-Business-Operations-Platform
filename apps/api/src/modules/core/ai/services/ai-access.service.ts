import type { AiKeyMode, AiKeyStatus, TaskModels } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import type { LlmProviderId } from '../../../../providers/llm';
import * as aiKeysRepository from '../repositories/ai-keys.repository';
import * as aiSettingsRepository from '../repositories/ai-settings.repository';
import * as aiUsageRepository from '../repositories/ai-usage.repository';
import { firstDayOfMonthText } from '../helpers/usage-math';

// What one business is allowed to use for the AI right now: its key mode, its own keys (still scrambled), what the platform
// allows it, and its own model order. Read fresh on every question, so a change takes effect at once.

/** One of the business's own keys, still scrambled. The code that calls the AI company unscrambles it at the last moment. */
export interface OwnKeyToUse {
  keyId: string;
  encryptedKey: string;
  status: AiKeyStatus;
}

export interface AiAccess {
  keyMode: AiKeyMode;
  platformEnabled: boolean;
  platformExpiresAt: Date | null;
  platformMonthlyCallCap: number | null;
  /** Answered calls this month on the platform's keys (counted only when there is a cap, otherwise 0). */
  platformCallsThisMonth: number;
  taskModels: TaskModels;
  /** The business's live keys per company, oldest first. */
  ownKeysByProvider: Map<LlmProviderId, OwnKeyToUse[]>;
}

/** Reads the business's settings and keys (one fenced transaction). A business with no settings has the defaults. */
export async function loadAiAccess(database: Database, accountId: string, now: Date = new Date()): Promise<AiAccess> {
  return database.runInAccountTransaction(accountId, async (transaction) => {
    const settings = await aiSettingsRepository.findSettings(transaction, accountId);
    const keys = await aiKeysRepository.listKeysToUse(transaction, accountId);
    const ownKeysByProvider = new Map<LlmProviderId, OwnKeyToUse[]>();
    for (const key of keys) {
      const keysOfProvider = ownKeysByProvider.get(key.provider) ?? [];
      keysOfProvider.push({ keyId: key.id, encryptedKey: key.encryptedKey, status: key.status });
      ownKeysByProvider.set(key.provider, keysOfProvider);
    }
    const platformCallsThisMonth =
      settings.platformMonthlyCallCap === null
        ? 0
        : await aiUsageRepository.countPlatformCallsSince(transaction, accountId, firstDayOfMonthText(now));
    return {
      keyMode: settings.keyMode,
      platformEnabled: settings.platformEnabled,
      platformExpiresAt: settings.platformExpiresAt,
      platformMonthlyCallCap: settings.platformMonthlyCallCap,
      platformCallsThisMonth,
      taskModels: settings.taskModels,
      ownKeysByProvider,
    };
  });
}
