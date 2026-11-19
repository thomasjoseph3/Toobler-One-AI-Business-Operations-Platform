import type { AiCall, AiCallsQuery, AiCallsResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import type { Principal } from '../../../../kernel/http/guard';
import * as aiUsageRepository from '../repositories/ai-usage.repository';
import type { StoredCallRow } from '../repositories/ai-usage.repository';

/** The tries of a stored call, as the API shows them (positions and outcomes only). */
function toAttempts(stored: unknown): AiCall['attempts'] {
  return Array.isArray(stored) ? (stored as AiCall['attempts']) : [];
}

/** Turns a stored call into the AiCall the API answers with. */
function toAiCall(row: StoredCallRow): AiCall {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    task: row.task,
    agentId: row.agentId,
    channel: row.channel,
    promptVersion: row.promptVersion,
    conversationId: row.conversationId,
    provider: row.provider,
    modelName: row.modelName,
    keySource: row.keySource,
    keyPosition: row.keyPosition,
    success: row.success,
    errorKind: row.errorKind,
    attemptCount: row.attemptCount,
    fallbackUsed: row.fallbackUsed,
    fallbackReason: row.fallbackReason,
    attempts: toAttempts(row.attempts),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedTokens: row.cachedTokens,
    latencyMs: row.latencyMs,
  };
}

/** The log of the business's AI calls. Managers read it. There is no text of any conversation in it, and no key. */
export function createAiCallLogService({ database }: { database: Database }) {
  return {
    /**
     * The latest calls, newest first, optionally only one job, agent or channel, or only the answered or the failed ones. Pages back
     * in time: pass `nextBefore` of one answer as `before` of the next question.
     */
    async listCalls(principal: Pick<Principal, 'accountId'>, query: AiCallsQuery): Promise<AiCallsResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        aiUsageRepository.listCalls(transaction, {
          accountId: principal.accountId,
          task: query.task,
          agent: query.agent,
          channel: query.channel,
          success: query.success,
          before: query.before ? new Date(query.before) : undefined,
          limit: query.limit,
        }),
      );
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        items: page.map(toAiCall),
        nextBefore: hasMore ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
      };
    },
  };
}
