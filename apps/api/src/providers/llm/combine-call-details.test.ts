import { describe, expect, it } from 'vitest';
import { combineCallDetails } from './combine-call-details';
import type { LlmCallDetails } from './llm-types';

const roundOf = (overrides: Partial<LlmCallDetails> = {}): LlmCallDetails => ({
  servedBy: { provider: 'gemini', modelName: 'first', keySource: 'platform', keyPosition: 1 },
  attempts: [{ provider: 'gemini', modelName: 'first', keySource: 'platform', keyPosition: 1, outcome: 'ok' }],
  fallbackUsed: false,
  fallbackReason: null,
  usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 40, usageMissing: false },
  latencyMs: 200,
  ...overrides,
});

describe('combineCallDetails (the rounds of one answer as one record)', () => {
  it('adds up the tokens and the time, and keeps every attempt', () => {
    const combined = combineCallDetails([roundOf(), roundOf(), roundOf()]);
    expect(combined.usage).toEqual({ inputTokens: 300, outputTokens: 30, cachedTokens: 120, usageMissing: false });
    expect(combined.latencyMs).toBe(600);
    expect(combined.attempts).toHaveLength(3);
  });

  it('says who answered last, and remembers that a fallback was used in any round and why', () => {
    const fallbackRound = roundOf({ fallbackUsed: true, fallbackReason: 'rate_limited' });
    const lastRound = roundOf({
      servedBy: { provider: 'openai', modelName: 'second', keySource: 'own', keyPosition: 2 },
    });
    const combined = combineCallDetails([fallbackRound, lastRound]);
    expect(combined.servedBy.modelName).toBe('second');
    expect(combined.fallbackUsed).toBe(true);
    expect(combined.fallbackReason).toBe('rate_limited');
  });

  it('flags missing token numbers when any round lacked them', () => {
    const missing = roundOf({ usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, usageMissing: true } });
    expect(combineCallDetails([roundOf(), missing]).usage.usageMissing).toBe(true);
  });

  it('refuses an empty list', () => {
    expect(() => combineCallDetails([])).toThrow();
  });
});
