import {
  LlmAllAttemptsFailedError,
  LlmNoCandidatesError,
  type LlmAttempt,
  type LlmCallDetails,
  type LlmCandidate,
  type LlmErrorKind,
  type LlmUsage,
} from './llm-types';
import { isDailyQuotaError, readLlmError } from './read-llm-error';

// The loop that tries each model and key in order until one answers, and records what happened. Used by the real
// LangChain provider and by the scripted test provider, so the tests exercise the real fallback code.

/** What one successful try gives back. */
export interface OneTryResult<Value> {
  value: Value;
  usage: LlmUsage;
}

/**
 * Tries the candidates in order. Returns the first answer together with the call's details (who answered, every attempt,
 * whether a fallback was used, tokens, time taken). Throws LlmAllAttemptsFailedError when none worked, and
 * LlmNoCandidatesError when there was nothing to try. A bad key or a missing model moves on at once; a rate limit too.
 */
export async function runWithFallback<Value>(
  candidates: LlmCandidate[],
  tryOnce: (candidate: LlmCandidate) => Promise<OneTryResult<Value>>,
  now: () => number = Date.now,
): Promise<{ value: Value; details: LlmCallDetails }> {
  if (candidates.length === 0) throw new LlmNoCandidatesError();
  const startedAt = now();
  const attempts: LlmAttempt[] = [];
  let firstFailureKind: LlmErrorKind | null = null;
  let lastFailureKind: LlmErrorKind = 'error';

  for (const candidate of candidates) {
    const attemptBase = {
      provider: candidate.provider,
      modelName: candidate.modelName,
      keySource: candidate.keySource,
      keyPosition: candidate.keyPosition,
    };
    try {
      const result = await tryOnce(candidate);
      attempts.push({ ...attemptBase, outcome: 'ok' });
      return {
        value: result.value,
        details: {
          servedBy: attemptBase,
          attempts,
          fallbackUsed: attempts.length > 1,
          fallbackReason: attempts.length > 1 ? firstFailureKind : null,
          usage: result.usage,
          latencyMs: now() - startedAt,
        },
      };
    } catch (error) {
      // The reason is read from the error's text; the text itself is dropped (it could echo part of a request)
      const failureKind = readLlmError(error);
      attempts.push({
        ...attemptBase,
        outcome: failureKind,
        ...(failureKind === 'rate_limited' ? { dailyQuota: isDailyQuotaError(error) } : {}),
      });
      firstFailureKind ??= failureKind;
      lastFailureKind = failureKind;
    }
  }
  throw new LlmAllAttemptsFailedError(attempts, lastFailureKind);
}
