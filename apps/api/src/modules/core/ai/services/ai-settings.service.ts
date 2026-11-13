import type { AiSettings, UpdateAiSettingsRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { findProblemsInTaskModels } from '../helpers/check-task-models';
import { findAllModels } from '../repositories/ai-models.repository';
import * as aiSettingsRepository from '../repositories/ai-settings.repository';
import type { AiSettingsRow } from '../repositories/ai-settings.repository';

/** Turns the stored settings into what the API shows (the platform's part is shown read-only). */
export function toAiSettings(row: AiSettingsRow): AiSettings {
  return {
    keyMode: row.keyMode,
    taskModels: row.taskModels,
    platformAccess: {
      enabled: row.platformEnabled,
      monthlyCallCap: row.platformMonthlyCallCap,
      expiresAt: row.platformExpiresAt ? row.platformExpiresAt.toISOString() : null,
    },
  };
}

/**
 * A business's AI settings. The manager chooses the key mode and its own model order for jobs; what the platform has allowed
 * (platform keys on or off, the cap, the end date) is shown but changed only by the platform team.
 */
export function createAiSettingsService({ database }: { database: Database }) {
  return {
    /** The business's settings, or the defaults (own keys only, no overrides) when none were saved yet. */
    async getSettings(principal: Pick<Principal, 'accountId'>): Promise<AiSettings> {
      const row = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        aiSettingsRepository.findSettings(transaction, principal.accountId),
      );
      return toAiSettings(row);
    },

    /**
     * Changes the key mode and/or the business's own model order. `taskModels` replaces the whole set of overrides ({} clears them
     * all). Sending nothing answers 400 NOTHING_TO_CHANGE; an unknown job, an unknown, retired or voice model, or a model listed twice
     * answers 400 INVALID_TASK_MODELS naming each problem. Choosing a platform mode is allowed even before the platform has switched
     * its keys on (the answer shows what is allowed). Writes an activity-log line and the `ai.settings_updated` event (field names only).
     */
    async updateSettings(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: UpdateAiSettingsRequest,
    ): Promise<AiSettings> {
      if (request.keyMode === undefined && request.taskModels === undefined) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send a key mode, a set of models, or both.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const changedFields = [
        ...(request.keyMode !== undefined ? ['keyMode'] : []),
        ...(request.taskModels !== undefined ? ['taskModels'] : []),
      ];
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (request.taskModels !== undefined) {
          const problems = findProblemsInTaskModels(await findAllModels(transaction), request.taskModels);
          if (problems.length > 0) {
            throw new ApiError(400, 'INVALID_TASK_MODELS', 'Some of the chosen models cannot be used.', { problems });
          }
        }
        await aiSettingsRepository.saveManagerSettings(transaction, {
          accountId,
          keyMode: request.keyMode,
          taskModels: request.taskModels,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'ai.settings_updated',
          details: { recordType: 'ai_settings', fields: changedFields },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'ai.settings_updated',
          payload: { fields: changedFields },
        });
        return toAiSettings(await aiSettingsRepository.findSettings(transaction, accountId));
      });
    },
  };
}
