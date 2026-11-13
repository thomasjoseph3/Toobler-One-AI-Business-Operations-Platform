import type { LlmAttempt } from '../../../../providers/llm';
import type { AiCallRecord } from '../services/ai-calls.service';
import type { CallToRecord } from '../repositories/ai-usage.repository';

// Pure: turns a finished AI call into the row that is stored about it. No message text and no key can get in: the row holds only
// names, positions, outcomes, tokens and times.

/** The tries as stored: positions and outcomes, never a key. */
function attemptsToStore(attempts: LlmAttempt[]) {
  return attempts.map((attempt) => ({
    provider: attempt.provider,
    modelName: attempt.modelName,
    keySource: attempt.keySource,
    keyPosition: attempt.keyPosition,
    outcome: attempt.outcome,
  }));
}

/**
 * Describes a finished call for storing. An answered call is described by who answered; a failed one by the last try. Returns null
 * when nothing was even tried (there is nothing to write down). The caller gives the row its id.
 */
export function describeCallForRecord(record: AiCallRecord): Omit<CallToRecord, 'id'> | null {
  const lastAttempt = record.attempts[record.attempts.length - 1];
  const servedBy = record.details?.servedBy ?? lastAttempt;
  if (!servedBy) return null;
  return {
    accountId: record.accountId,
    task: record.tag.task,
    agentId: record.tag.agentId,
    channel: record.tag.channel,
    promptVersion: record.tag.promptVersion,
    conversationId: record.tag.conversationId ?? null,
    provider: servedBy.provider,
    modelName: servedBy.modelName,
    keySource: servedBy.keySource,
    keyPosition: servedBy.keyPosition,
    success: record.details !== null,
    errorKind: record.details === null && lastAttempt && lastAttempt.outcome !== 'ok' ? lastAttempt.outcome : null,
    attemptCount: record.attempts.length,
    fallbackUsed: record.details?.fallbackUsed ?? false,
    fallbackReason: record.details?.fallbackReason ?? null,
    attempts: attemptsToStore(record.attempts),
    inputTokens: record.details?.usage.inputTokens ?? 0,
    outputTokens: record.details?.usage.outputTokens ?? 0,
    cachedTokens: record.details?.usage.cachedTokens ?? 0,
    usageMissing: record.details?.usage.usageMissing ?? false,
    latencyMs: record.details?.latencyMs ?? null,
  };
}
