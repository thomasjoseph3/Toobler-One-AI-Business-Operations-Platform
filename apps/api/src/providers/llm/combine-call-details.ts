import type { LlmCallDetails } from './llm-types';

/**
 * Adds the details of several model calls (the rounds of one answer) into one record, so an answer that needed three rounds is
 * one call in the usage records: every attempt kept, the tokens added up, the times added up. Who answered is the last round.
 * Needs at least one round.
 */
export function combineCallDetails(rounds: readonly LlmCallDetails[]): LlmCallDetails {
  const lastRound = rounds.at(-1);
  if (!lastRound) throw new Error('combineCallDetails needs at least one round');
  return {
    servedBy: lastRound.servedBy,
    attempts: rounds.flatMap((round) => round.attempts),
    fallbackUsed: rounds.some((round) => round.fallbackUsed),
    fallbackReason: rounds.find((round) => round.fallbackUsed)?.fallbackReason ?? null,
    usage: {
      inputTokens: rounds.reduce((total, round) => total + round.usage.inputTokens, 0),
      outputTokens: rounds.reduce((total, round) => total + round.usage.outputTokens, 0),
      cachedTokens: rounds.reduce((total, round) => total + round.usage.cachedTokens, 0),
      usageMissing: rounds.some((round) => round.usage.usageMissing),
    },
    latencyMs: rounds.reduce((total, round) => total + round.latencyMs, 0),
  };
}
