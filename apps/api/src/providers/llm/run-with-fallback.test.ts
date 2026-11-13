import { describe, expect, it } from 'vitest';
import { LlmAllAttemptsFailedError, LlmNoCandidatesError, type LlmCandidate } from './llm-types';
import { runWithFallback } from './run-with-fallback';

const candidate = (
  modelName: string,
  keyPosition: number,
  provider: LlmCandidate['provider'] = 'gemini',
): LlmCandidate => ({
  provider,
  modelName,
  apiKey: `secret-key-${keyPosition}`,
  keySource: 'platform',
  keyPosition,
});
const usage = { inputTokens: 10, outputTokens: 5, cachedTokens: 2, usageMissing: false };

describe('runWithFallback', () => {
  it('answers from the first candidate with no fallback', async () => {
    const outcome = await runWithFallback([candidate('m1', 1), candidate('m2', 1)], async () => ({
      value: 'hi',
      usage,
    }));
    expect(outcome.value).toBe('hi');
    expect(outcome.details).toMatchObject({
      servedBy: { modelName: 'm1', keyPosition: 1 },
      fallbackUsed: false,
      fallbackReason: null,
      usage,
    });
    expect(outcome.details.attempts).toHaveLength(1);
  });

  it('falls back when the first is rate limited and says why', async () => {
    const outcome = await runWithFallback([candidate('m1', 1), candidate('m1', 2)], async (tried) => {
      if (tried.keyPosition === 1) throw new Error('429 quota exceeded per day');
      return { value: 'from key 2', usage };
    });
    expect(outcome.value).toBe('from key 2');
    expect(outcome.details.fallbackUsed).toBe(true);
    expect(outcome.details.fallbackReason).toBe('rate_limited');
    expect(outcome.details.servedBy.keyPosition).toBe(2);
    expect(outcome.details.attempts[0]).toMatchObject({ outcome: 'rate_limited', dailyQuota: true });
  });

  it('moves on from a rejected key and from a missing model, across providers', async () => {
    const outcome = await runWithFallback(
      [candidate('m1', 1), candidate('retired', 1), candidate('gpt', 1, 'openai')],
      async (tried) => {
        if (tried.modelName === 'm1') throw new Error('API key not valid');
        if (tried.modelName === 'retired') throw new Error('404 model not found');
        return { value: 'gpt answered', usage };
      },
    );
    expect(outcome.details.attempts.map((attempt) => attempt.outcome)).toEqual(['bad_key', 'model_missing', 'ok']);
    expect(outcome.details.fallbackReason).toBe('bad_key');
    expect(outcome.details.servedBy.provider).toBe('openai');
  });

  it('throws with every attempt when none works, and the attempts never hold a key', async () => {
    const error = await runWithFallback([candidate('m1', 1), candidate('m2', 2)], async () => {
      throw new Error('socket hang up');
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmAllAttemptsFailedError);
    const failure = error as LlmAllAttemptsFailedError;
    expect(failure.attempts.map((attempt) => attempt.outcome)).toEqual(['error', 'error']);
    expect(failure.lastErrorKind).toBe('error');
    expect(JSON.stringify(failure.attempts)).not.toContain('secret-key');
    expect(failure.message).not.toContain('secret-key');
  });

  it('refuses a call with nothing to try', async () => {
    await expect(runWithFallback([], async () => ({ value: 1, usage }))).rejects.toBeInstanceOf(LlmNoCandidatesError);
  });

  it('measures the time taken with the clock it is given', async () => {
    let time = 1_000;
    const outcome = await runWithFallback(
      [candidate('m1', 1)],
      async () => {
        time += 250;
        return { value: 'x', usage };
      },
      () => time,
    );
    expect(outcome.details.latencyMs).toBe(250);
  });
});
