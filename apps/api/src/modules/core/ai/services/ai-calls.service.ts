import type { AiKeyStatus } from '@toobler-one/shared';
import type { ZodType } from 'zod';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import {
  LLM_PROVIDER_IDS,
  LlmAllAttemptsFailedError,
  LlmNoCandidatesError,
  poolFor,
  type LlmAttempt,
  type LlmCallDetails,
  type LlmCallTag,
  type LlmCandidate,
  type LlmObjectResult,
  type LlmPrompt,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  type LlmTextResult,
} from '../../../../providers/llm';
import { buildCandidates, chooseModelsForTask, chooseOrderForTask } from '../helpers/choose-models-for-task';
import { decideKeySources, type KeySourceDecision } from '../helpers/decide-key-sources';
import { ownKeyPoolName } from '../helpers/pool-names';
import { decryptSecret } from '../helpers/secret-box';
import { findAllModels, findModelOrderPerTask } from '../repositories/ai-models.repository';
import * as aiKeysRepository from '../repositories/ai-keys.repository';
import { loadAiAccess, type AiAccess } from './ai-access.service';
import { createDatabaseCallRecorder } from './ai-call-recorder.service';

/** What a feature gives when it wants the AI to do a job. The job's model and key are chosen here, never by the caller. */
export interface AiCallInput {
  /** The business the call is for. Its settings, keys and (in later slices) cap and usage apply. */
  accountId: string;
  /** Who is asking. Required, so usage can always be split by job, agent and channel. */
  tag: LlmCallTag;
  prompt: LlmPrompt;
  temperature?: number;
  maxOutputTokens?: number;
}

/** One finished call, for the usage records. Never holds any text of the conversation or any key. */
export interface AiCallRecord {
  accountId: string;
  tag: LlmCallTag;
  /** The details of an answered call, or null when every try failed. */
  details: LlmCallDetails | null;
  /** The tries made (also for a call that failed). */
  attempts: LlmAttempt[];
}

/** Where finished calls are written down. By default the database (the call record and the day's totals). */
export interface AiCallRecorder {
  record(record: AiCallRecord): Promise<void>;
}

export interface AiServiceDependencies {
  database: Database;
  config: Config;
  llm: LlmProvider;
  recorder?: AiCallRecorder;
  /** Told about a problem that must not fail the customer's answer (like not being able to note a key's health). */
  reportProblem?: (what: string, error: unknown) => void;
}

/** The things to try for a job, and what is needed to learn from the result. */
interface PreparedCall {
  candidates: LlmCandidate[];
  access: AiAccess;
}

/** A key's status and note after real use showed what the company thinks of it. Other results say nothing about the key. */
function healthAfterAttempt(attempt: LlmAttempt): { status: AiKeyStatus; note: string } | null {
  if (attempt.outcome === 'ok') return { status: 'working', note: 'Answered a real request.' };
  if (attempt.outcome === 'bad_key') return { status: 'failed', note: 'The AI company rejected this key.' };
  if (attempt.outcome === 'rate_limited') {
    return { status: 'limited', note: 'The AI company says the quota is used up or it is busy.' };
  }
  return null;
}

/** Turns "every try failed" into a clear answer for the person, with no provider text and no key. */
function toApiError(failure: LlmAllAttemptsFailedError): ApiError {
  if (failure.lastErrorKind === 'rate_limited') {
    return new ApiError(
      429,
      'AI_RATE_LIMITED',
      'The AI is busy or its quota is used up for now. Please try again shortly.',
    );
  }
  return new ApiError(502, 'AI_FAILED', 'The AI could not answer just now. Please try again.');
}

/** The answer when there is no key to try: it says what is missing, in terms of what the business can do about it. */
function toNothingToTryError(sources: KeySourceDecision, hasOwnKeys: boolean): ApiError {
  if (sources.platformBlockedBecause === 'not_enabled' && !hasOwnKeys) {
    return new ApiError(
      503,
      'AI_ACCESS_NOT_ENABLED',
      "The platform's AI keys are not switched on for this business. Add your own key, or ask the platform team.",
    );
  }
  if (sources.platformBlockedBecause === 'ended' && !hasOwnKeys) {
    return new ApiError(
      503,
      'AI_ACCESS_ENDED',
      "This business's time on the platform's AI keys has ended. Add your own key, or ask the platform team.",
    );
  }
  if (sources.platformBlockedBecause === 'cap_reached' && !hasOwnKeys) {
    return new ApiError(
      402,
      'AI_CAP_REACHED',
      'This business has used all the calls the platform allowed it this month. Add your own key, or ask the platform team.',
    );
  }
  return new ApiError(503, 'AI_NOT_AVAILABLE', 'No AI key is set up for this job yet.');
}

/**
 * The way a feature uses the AI: say what job it is and what to ask, and get the answer plus who gave it. It reads the
 * business's settings, picks the models set for the job (the business's own order if it has one), tries the business's own keys
 * and/or the platform's as the key mode says, rests keys that hit a limit, notes what real use showed about the business's own
 * keys, and writes the call down.
 */
export function createAiService(dependencies: AiServiceDependencies) {
  const { database, config, llm } = dependencies;
  const recorder = dependencies.recorder ?? createDatabaseCallRecorder({ database });
  const reportProblem = dependencies.reportProblem ?? (() => {});

  /** The ordered models and keys to try for a job for this business. Throws a clear error when nothing is set up for it. */
  async function prepareCall(accountId: string, taskId: string): Promise<PreparedCall> {
    const access = await loadAiAccess(database, accountId);
    const sources = decideKeySources({
      keyMode: access.keyMode,
      platformEnabled: access.platformEnabled,
      platformExpiresAt: access.platformExpiresAt,
      platformMonthlyCallCap: access.platformMonthlyCallCap,
      platformCallsThisMonth: access.platformCallsThisMonth,
      now: new Date(),
    });
    const catalogue = await findAllModels(database.system);
    const platformOrderPerTask = await findModelOrderPerTask(database.system);
    const orderedModelIds = chooseOrderForTask({ businessTaskModels: access.taskModels, platformOrderPerTask, taskId });

    const candidates: LlmCandidate[] = [];

    // The business's own keys first: they cost the platform nothing
    const secretKey = config.secrets.encryptionKey;
    if (sources.useOwn && secretKey) {
      const providersWithOwnKeys = new Set<LlmProviderId>(
        LLM_PROVIDER_IDS.filter((provider) => (access.ownKeysByProvider.get(provider)?.length ?? 0) > 0),
      );
      // Each company's keys are unscrambled once per call, only here, and only held for this call
      const readyKeys = new Map<LlmProviderId, { pool: ReturnType<typeof poolFor> }>();
      const poolOfOwnKeys = (provider: LlmProviderId) => {
        let ready = readyKeys.get(provider);
        if (!ready) {
          const ownKeys = access.ownKeysByProvider.get(provider) ?? [];
          const plainKeys = ownKeys.map((ownKey) => decryptSecret(ownKey.encryptedKey, secretKey, accountId));
          ready = {
            pool: poolFor(
              plainKeys,
              ownKeyPoolName(
                accountId,
                provider,
                ownKeys.map((ownKey) => ownKey.keyId),
              ),
            ),
          };
          readyKeys.set(provider, ready);
        }
        return ready.pool;
      };
      const ownModels = chooseModelsForTask({ catalogue, orderedModelIds, providersWithKeys: providersWithOwnKeys });
      candidates.push(
        ...buildCandidates({
          models: ownModels,
          keySource: 'own',
          keysFor: (provider, modelName) => poolOfOwnKeys(provider).keysToTry(modelName),
        }),
      );
    }

    // Then the platform's keys, only while the platform has allowed them
    if (sources.usePlatform) {
      const providersWithPlatformKeys = new Set<LlmProviderId>(
        LLM_PROVIDER_IDS.filter((provider) => config.ai.platformKeys[provider].length > 0),
      );
      const platformModels = chooseModelsForTask({
        catalogue,
        orderedModelIds,
        providersWithKeys: providersWithPlatformKeys,
      });
      candidates.push(
        ...buildCandidates({
          models: platformModels,
          keySource: 'platform',
          keysFor: (provider, modelName) => poolFor(config.ai.platformKeys[provider]).keysToTry(modelName),
        }),
      );
    }

    if (candidates.length === 0) {
      const hasOwnKeys = [...access.ownKeysByProvider.values()].some((keys) => keys.length > 0);
      throw toNothingToTryError(sources, hasOwnKeys);
    }
    return { candidates, access };
  }

  /** Sets aside the keys that failed in a call (a rate limit, or a rejected key), so the next call tries other keys first. */
  function restFailedKeys(accountId: string, access: AiAccess, attempts: LlmAttempt[]): void {
    for (const attempt of attempts) {
      const ownKeys = access.ownKeysByProvider.get(attempt.provider) ?? [];
      const pool =
        attempt.keySource === 'platform'
          ? poolFor(config.ai.platformKeys[attempt.provider])
          : poolFor(
              [],
              ownKeyPoolName(
                accountId,
                attempt.provider,
                ownKeys.map((ownKey) => ownKey.keyId),
              ),
            );
      if (attempt.outcome === 'rate_limited') {
        pool.markLimited(attempt.keyPosition, attempt.modelName, attempt.dailyQuota === true);
      }
      if (attempt.outcome === 'bad_key') pool.markBad(attempt.keyPosition);
    }
  }

  /**
   * Notes what real use showed about the business's own keys (working, limited, failed), but only when it changes a key's status,
   * so ordinary calls write nothing. A problem noting this never fails the answer the customer is waiting for.
   */
  async function noteOwnKeyHealth(accountId: string, access: AiAccess, attempts: LlmAttempt[]): Promise<void> {
    const newStatusByKeyId = new Map<string, { status: AiKeyStatus; note: string; was: AiKeyStatus }>();
    for (const attempt of attempts) {
      if (attempt.keySource !== 'own') continue;
      const ownKey = access.ownKeysByProvider.get(attempt.provider)?.[attempt.keyPosition - 1];
      const health = healthAfterAttempt(attempt);
      if (!ownKey || !health) continue;
      const currentStatus = newStatusByKeyId.get(ownKey.keyId)?.status ?? ownKey.status;
      if (health.status !== currentStatus) {
        newStatusByKeyId.set(ownKey.keyId, { ...health, was: ownKey.status });
      }
    }
    if (newStatusByKeyId.size === 0) return;
    try {
      await database.runInAccountTransaction(accountId, async (transaction) => {
        for (const [keyId, change] of newStatusByKeyId) {
          const actor = { kind: 'system' as const, id: 'core.ai' };
          await aiKeysRepository.updateKeyHealth(transaction, {
            accountId,
            keyId,
            status: change.status,
            note: change.note,
            checkedAt: new Date(),
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'ai.key_status_changed',
            details: { recordType: 'ai_key', recordId: keyId, fields: ['status'] },
          });
        }
      });
    } catch (error) {
      reportProblem('Could not note the health of an AI key', error);
    }
  }

  /** Writes the call down. A problem doing that is reported but never fails the answer the customer is waiting for. */
  async function recordSafely(record: AiCallRecord): Promise<void> {
    try {
      await recorder.record(record);
    } catch (error) {
      reportProblem('Could not record an AI call', error);
    }
  }

  /** Runs one call with the fallback, then rests failed keys, notes key health and writes the call down (also when it failed). */
  async function run<Result extends { details: LlmCallDetails }>(
    input: AiCallInput,
    call: (request: LlmRequest) => Promise<Result>,
  ): Promise<Result> {
    const { candidates, access } = await prepareCall(input.accountId, input.tag.task);
    const request: LlmRequest = {
      tag: input.tag,
      candidates,
      prompt: input.prompt,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    };
    try {
      const result = await call(request);
      restFailedKeys(input.accountId, access, result.details.attempts);
      await noteOwnKeyHealth(input.accountId, access, result.details.attempts);
      await recordSafely({
        accountId: input.accountId,
        tag: input.tag,
        details: result.details,
        attempts: result.details.attempts,
      });
      return result;
    } catch (error) {
      if (error instanceof LlmAllAttemptsFailedError) {
        restFailedKeys(input.accountId, access, error.attempts);
        await noteOwnKeyHealth(input.accountId, access, error.attempts);
        await recordSafely({ accountId: input.accountId, tag: input.tag, details: null, attempts: error.attempts });
        throw toApiError(error);
      }
      if (error instanceof LlmNoCandidatesError) {
        throw new ApiError(503, 'AI_NOT_AVAILABLE', 'No AI key is set up for this job yet.');
      }
      throw error;
    }
  }

  return {
    /** Asks the AI for text. Returns the text and the call's details (who answered, fallback, tokens). */
    generateText: (input: AiCallInput): Promise<LlmTextResult> => run(input, (request) => llm.generateText(request)),

    /** Asks the AI for an answer that fits a shape (checked again here). Returns the value and the call's details. */
    generateObject: <Value>(input: AiCallInput, schema: ZodType<Value>): Promise<LlmObjectResult<Value>> =>
      run(input, (request) => llm.generateObject(request, schema)),
  };
}
