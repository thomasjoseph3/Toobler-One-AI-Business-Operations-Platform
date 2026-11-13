import { sql } from 'kysely';
import type { AiUsageGroupBy } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import type { LlmProviderId } from '../../../../providers/llm';

// The SQL for `ai_calls` (one row per call) and `ai_usage` (the daily totals). Every query names the business as well as what it
// looks for (defence in depth: the database also fences every query by business). Nothing here holds message text or a key.

/** One call to write down. */
export interface CallToRecord {
  id: string;
  accountId: string;
  task: string;
  agentId: string;
  channel: string;
  promptVersion: string;
  conversationId: string | null;
  provider: LlmProviderId;
  modelName: string;
  keySource: 'platform' | 'own';
  keyPosition: number;
  success: boolean;
  errorKind: string | null;
  attemptCount: number;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  attempts: unknown[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  usageMissing: boolean;
  latencyMs: number | null;
}

/** Writes down one call, and adds it to the day's totals (same transaction, so the two always agree). */
export async function insertCallAndAddToDailyUsage(db: Db, call: CallToRecord, day: string): Promise<void> {
  await db
    .insertInto('ai_calls')
    .values({
      id: call.id,
      account_id: call.accountId,
      task: call.task,
      agent_id: call.agentId,
      channel: call.channel,
      prompt_version: call.promptVersion,
      conversation_id: call.conversationId,
      provider: call.provider,
      model_name: call.modelName,
      key_source: call.keySource,
      key_position: call.keyPosition,
      success: call.success,
      error_kind: call.errorKind,
      attempt_count: call.attemptCount,
      fallback_used: call.fallbackUsed,
      fallback_reason: call.fallbackReason,
      attempts: JSON.stringify(call.attempts),
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      cached_tokens: call.cachedTokens,
      usage_missing: call.usageMissing,
      latency_ms: call.latencyMs,
    })
    .execute();
  const answered = call.success ? 1 : 0;
  const failed = call.success ? 0 : 1;
  const fellBack = call.fallbackUsed ? 1 : 0;
  await db
    .insertInto('ai_usage')
    .values({
      account_id: call.accountId,
      day,
      provider: call.provider,
      model_name: call.modelName,
      task: call.task,
      agent_id: call.agentId,
      channel: call.channel,
      key_source: call.keySource,
      calls: answered,
      failures: failed,
      fallbacks: fellBack,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      cached_tokens: call.cachedTokens,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['account_id', 'day', 'provider', 'model_name', 'task', 'agent_id', 'channel', 'key_source'])
        .doUpdateSet({
          calls: sql`ai_usage.calls + ${answered}`,
          failures: sql`ai_usage.failures + ${failed}`,
          fallbacks: sql`ai_usage.fallbacks + ${fellBack}`,
          input_tokens: sql`ai_usage.input_tokens + ${call.inputTokens}`,
          output_tokens: sql`ai_usage.output_tokens + ${call.outputTokens}`,
          cached_tokens: sql`ai_usage.cached_tokens + ${call.cachedTokens}`,
        }),
    )
    .execute();
}

/** Answered calls on the platform's keys from this day on (the number the monthly cap is counted from). */
export async function countPlatformCallsSince(db: Db, accountId: string, fromDay: string): Promise<number> {
  const row = await db
    .selectFrom('ai_usage')
    .select(sql<string>`coalesce(sum(calls), 0)`.as('total'))
    .where('account_id', '=', accountId)
    .where('key_source', '=', 'platform')
    .where('day', '>=', fromDay)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The totals of a set of calls. */
export interface UsageTotals {
  calls: number;
  failures: number;
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

/** Totals for the days from..to (both included), either all together (no groupBy) or split by job, agent, channel, model or day. */
export async function sumUsage(
  db: Db,
  options: { accountId: string; from: string; to: string; groupBy: AiUsageGroupBy | null },
): Promise<Array<UsageTotals & { key: string }>> {
  const groupExpression = {
    task: sql<string>`task`,
    agent: sql<string>`agent_id`,
    channel: sql<string>`channel`,
    model: sql<string>`provider || ':' || model_name`,
    day: sql<string>`to_char(day, 'YYYY-MM-DD')`,
    none: sql<string>`'all'`,
  }[options.groupBy ?? 'none'];
  let query = db
    .selectFrom('ai_usage')
    .select([
      groupExpression.as('key'),
      sql<string>`coalesce(sum(calls), 0)`.as('calls'),
      sql<string>`coalesce(sum(failures), 0)`.as('failures'),
      sql<string>`coalesce(sum(fallbacks), 0)`.as('fallbacks'),
      sql<string>`coalesce(sum(input_tokens), 0)`.as('input_tokens'),
      sql<string>`coalesce(sum(output_tokens), 0)`.as('output_tokens'),
      sql<string>`coalesce(sum(cached_tokens), 0)`.as('cached_tokens'),
    ])
    .where('account_id', '=', options.accountId)
    .where('day', '>=', options.from)
    .where('day', '<=', options.to);
  // With no grouping the answer is one row of totals; a constant cannot be grouped by, so there is no GROUP BY at all
  if (options.groupBy !== null) query = query.groupBy(groupExpression);
  const rows = await query.orderBy('key').execute();
  return rows.map((row) => ({
    key: row.key,
    calls: Number(row.calls),
    failures: Number(row.failures),
    fallbacks: Number(row.fallbacks),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    cachedTokens: Number(row.cached_tokens),
  }));
}

/** The latest answered call of each job. */
export interface LastAnswerRow {
  task: string;
  provider: LlmProviderId;
  modelName: string;
  keySource: 'platform' | 'own';
  at: Date;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export async function findLastAnswerPerTask(db: Db, accountId: string): Promise<LastAnswerRow[]> {
  const rows = await db
    .selectFrom('ai_calls')
    .select(['task', 'provider', 'model_name', 'key_source', 'created_at', 'fallback_used', 'fallback_reason'])
    .distinctOn('task')
    .where('account_id', '=', accountId)
    .where('success', '=', true)
    .orderBy('task')
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map((row) => ({
    task: row.task,
    provider: row.provider,
    modelName: row.model_name,
    keySource: row.key_source,
    at: row.created_at,
    fallbackUsed: row.fallback_used,
    fallbackReason: row.fallback_reason,
  }));
}

/** One stored call, for the call log. */
export interface StoredCallRow {
  id: string;
  createdAt: Date;
  task: string;
  agentId: string;
  channel: string;
  promptVersion: string;
  conversationId: string | null;
  provider: LlmProviderId;
  modelName: string;
  keySource: 'platform' | 'own';
  keyPosition: number;
  success: boolean;
  errorKind: string | null;
  attemptCount: number;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  attempts: unknown;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number | null;
}

/** The business's calls, newest first, optionally narrowed by job, agent, channel or outcome, and starting before a moment. One extra row is asked for so the caller can tell whether there is another page. */
export async function listCalls(
  db: Db,
  options: {
    accountId: string;
    task?: string | undefined;
    agent?: string | undefined;
    channel?: string | undefined;
    success?: boolean | undefined;
    before?: Date | undefined;
    limit: number;
  },
): Promise<StoredCallRow[]> {
  let query = db.selectFrom('ai_calls').selectAll().where('account_id', '=', options.accountId);
  if (options.task !== undefined) query = query.where('task', '=', options.task);
  if (options.agent !== undefined) query = query.where('agent_id', '=', options.agent);
  if (options.channel !== undefined) query = query.where('channel', '=', options.channel);
  if (options.success !== undefined) query = query.where('success', '=', options.success);
  if (options.before !== undefined) query = query.where('created_at', '<', options.before);
  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit + 1)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    task: row.task,
    agentId: row.agent_id,
    channel: row.channel,
    promptVersion: row.prompt_version,
    conversationId: row.conversation_id,
    provider: row.provider,
    modelName: row.model_name,
    keySource: row.key_source,
    keyPosition: row.key_position,
    success: row.success,
    errorKind: row.error_kind,
    attemptCount: row.attempt_count,
    fallbackUsed: row.fallback_used,
    fallbackReason: row.fallback_reason,
    attempts: row.attempts,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    latencyMs: row.latency_ms,
  }));
}
