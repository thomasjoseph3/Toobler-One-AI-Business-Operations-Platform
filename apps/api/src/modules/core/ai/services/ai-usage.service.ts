import type {
  AiRestingKey,
  AiStatusResponse,
  AiUsageNumbers,
  AiUsageQuery,
  AiUsageResponse,
} from '@toobler-one/shared';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { LLM_PROVIDER_IDS, poolFor, type LlmProviderId } from '../../../../providers/llm';
import { AI_TASKS } from '../helpers/ai-tasks';
import { chooseModelsForTask, chooseOrderForTask } from '../helpers/choose-models-for-task';
import { decideKeySources } from '../helpers/decide-key-sources';
import { ownKeyPoolName } from '../helpers/pool-names';
import { cacheHitRate, chooseUsageRange, firstDayOfMonthText } from '../helpers/usage-math';
import { findAllModels, findModelOrderPerTask } from '../repositories/ai-models.repository';
import * as aiKeysRepository from '../repositories/ai-keys.repository';
import * as aiUsageRepository from '../repositories/ai-usage.repository';
import type { UsageTotals } from '../repositories/ai-usage.repository';
import { loadAiAccess } from './ai-access.service';

/** How long after a fallback answer a job still counts as running on a fallback. */
const FALLBACK_MEMORY_MS = 60 * 60 * 1000;

/** Adds the cache hit rate to a set of totals. */
function withCacheHitRate(totals: UsageTotals): AiUsageNumbers {
  return { ...totals, cacheHitRate: cacheHitRate(totals.cachedTokens, totals.inputTokens) };
}

/** What the business's AI has used, and what is running right now. Managers read it. */
export function createAiUsageService({
  database,
  config,
  now = () => new Date(),
}: {
  database: Database;
  config: Config;
  now?: () => Date;
}) {
  return {
    /**
     * Calls, failures, fallbacks and tokens for a range of days (this month so far when none is given), as one total or split by
     * job, agent, channel, model or day. Also shows the platform's keys against the cap: used this month, and what is left.
     * A range that is not real days, runs backwards or is longer than a year answers 400 INVALID_RANGE.
     */
    async getUsage(principal: Pick<Principal, 'accountId'>, query: AiUsageQuery): Promise<AiUsageResponse> {
      const today = now();
      const range = chooseUsageRange(query, today);
      if ('problem' in range) throw new ApiError(400, 'INVALID_RANGE', range.problem);
      const groupBy = query.groupBy ?? null;
      const accountId = principal.accountId;
      const access = await loadAiAccess(database, accountId, today);
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const all = await aiUsageRepository.sumUsage(transaction, {
          accountId,
          from: range.from,
          to: range.to,
          groupBy: null,
        });
        const groups = groupBy
          ? await aiUsageRepository.sumUsage(transaction, { accountId, from: range.from, to: range.to, groupBy })
          : [];
        const usedThisMonth = await aiUsageRepository.countPlatformCallsSince(
          transaction,
          accountId,
          firstDayOfMonthText(today),
        );
        const cap = access.platformMonthlyCallCap;
        const totals = all[0] ?? {
          key: 'all',
          calls: 0,
          failures: 0,
          fallbacks: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
        };
        return {
          from: range.from,
          to: range.to,
          groupBy,
          totals: withCacheHitRate(totals),
          groups: groups.map((group) => ({ key: group.key, ...withCacheHitRate(group) })),
          platform: {
            enabled: access.platformEnabled,
            monthlyCallCap: cap,
            usedThisMonth,
            remainingThisMonth: cap === null ? null : Math.max(0, cap - usedThisMonth),
            expiresAt: access.platformExpiresAt ? access.platformExpiresAt.toISOString() : null,
          },
        };
      });
    },

    /**
     * What is running right now, for each job: the model expected first for this business, what really answered last, and
     * whether it is on a fallback (within the last hour). Also the keys set aside for a while after a limit or a rejection. The
     * resting keys come from this running copy of the API's memory, and come back by themselves.
     */
    async getStatus(principal: Pick<Principal, 'accountId'>): Promise<AiStatusResponse> {
      const accountId = principal.accountId;
      const today = now();
      const access = await loadAiAccess(database, accountId, today);
      const sources = decideKeySources({
        keyMode: access.keyMode,
        platformEnabled: access.platformEnabled,
        platformExpiresAt: access.platformExpiresAt,
        platformMonthlyCallCap: access.platformMonthlyCallCap,
        platformCallsThisMonth: access.platformCallsThisMonth,
        now: today,
      });
      const catalogue = await findAllModels(database.system);
      const platformOrderPerTask = await findModelOrderPerTask(database.system);
      const providersWithKeys = new Set<LlmProviderId>(
        LLM_PROVIDER_IDS.filter(
          (provider) =>
            (sources.useOwn && (access.ownKeysByProvider.get(provider)?.length ?? 0) > 0) ||
            (sources.usePlatform && config.ai.platformKeys[provider].length > 0),
        ),
      );
      const { lastAnswers, ownKeyRows } = await database.runInAccountTransaction(accountId, async (transaction) => ({
        lastAnswers: await aiUsageRepository.findLastAnswerPerTask(transaction, accountId),
        ownKeyRows: await aiKeysRepository.listKeys(transaction, accountId),
      }));

      const tasks = AI_TASKS.map((task) => {
        const orderedModelIds = chooseOrderForTask({
          businessTaskModels: access.taskModels,
          platformOrderPerTask,
          taskId: task.id,
        });
        const expectedModelName =
          chooseModelsForTask({ catalogue, orderedModelIds, providersWithKeys })[0]?.modelName ?? null;
        const last = lastAnswers.find((answer) => answer.task === task.id);
        const recent = last !== undefined && today.getTime() - last.at.getTime() <= FALLBACK_MEMORY_MS;
        return {
          taskId: task.id,
          label: task.label,
          expectedModelName,
          lastAnswer: last
            ? {
                provider: last.provider,
                modelName: last.modelName,
                keySource: last.keySource,
                at: last.at.toISOString(),
                fallbackUsed: last.fallbackUsed,
                fallbackReason: last.fallbackReason,
              }
            : null,
          runningOnFallback:
            recent && (last.fallbackUsed || (expectedModelName !== null && last.modelName !== expectedModelName)),
        };
      });

      const restingKeys: AiRestingKey[] = [];
      for (const provider of LLM_PROVIDER_IDS) {
        const ownKeys = access.ownKeysByProvider.get(provider) ?? [];
        if (sources.useOwn && ownKeys.length > 0) {
          const pool = poolFor(
            [],
            ownKeyPoolName(
              accountId,
              provider,
              ownKeys.map((ownKey) => ownKey.keyId),
            ),
          );
          for (const resting of pool.restingUntil()) {
            const ownKey = ownKeys[resting.position - 1];
            restingKeys.push({
              keySource: 'own',
              provider,
              keyId: ownKey?.keyId ?? null,
              keyLabel: ownKeyRows.find((row) => row.id === ownKey?.keyId)?.label ?? null,
              keyPosition: resting.position,
              modelName: resting.scope,
              until: resting.until.toISOString(),
            });
          }
        }
        if (sources.usePlatform && config.ai.platformKeys[provider].length > 0) {
          for (const resting of poolFor(config.ai.platformKeys[provider]).restingUntil()) {
            restingKeys.push({
              keySource: 'platform',
              provider,
              keyId: null,
              keyLabel: null,
              keyPosition: resting.position,
              modelName: resting.scope,
              until: resting.until.toISOString(),
            });
          }
        }
      }
      return { tasks, restingKeys };
    },
  };
}
