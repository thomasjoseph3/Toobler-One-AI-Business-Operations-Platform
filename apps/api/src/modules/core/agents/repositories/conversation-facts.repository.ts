import type { CustomValue } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { AgentConversationState } from '../helpers/agent-conversation-state';
import type { PromiseKind } from '../helpers/choose-promise';

// The SQL for the `conversation_facts` table: what the agent learned in a conversation. One row per conversation. Every query names the
// business as well as the conversation (defence in depth: the database also fences every query by business).

/** Turns a stored list of texts back into a list of texts, ignoring anything that is not text (a damaged row never breaks a chat). */
function toTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Turns the stored details back into labelled texts, ignoring anything that is not text. */
function toDetails(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Turns the stored custom answers back into answers, ignoring anything that is not a text, number or yes/no. */
function toCustomAnswers(value: unknown): Record<string, CustomValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, CustomValue] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  );
}

/** What the agent remembers about the conversation, or undefined when nothing was saved yet. */
export async function findConversationState(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<AgentConversationState | undefined> {
  const row = await db
    .selectFrom('conversation_facts')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!row) return undefined;
  const promise =
    row.promise_kind && row.promise_sentence
      ? { kind: row.promise_kind as PromiseKind, sentence: row.promise_sentence, dueAt: row.promise_due_at }
      : null;
  return {
    details: toDetails(row.details),
    customAnswers: toCustomAnswers(row.custom_answers),
    askedPrice: row.asked_price,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    situation: row.situation,
    promise,
    callbackReason: row.callback_reason,
    earlierToolResults: toTexts(row.earlier_tool_results),
  };
}

/**
 * Saves what the agent remembers about the conversation: adds it the first time and changes it after. A promise already saved is never
 * replaced by a different one (only one is ever made), so a second saving cannot change what was said.
 */
export async function saveConversationState(
  db: Db,
  options: {
    accountId: string;
    conversationId: string;
    state: AgentConversationState;
    promiseMadeAt: Date | null;
    actor: Actor;
  },
): Promise<void> {
  const { state } = options;
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const values = {
    details: JSON.stringify(state.details),
    custom_answers: JSON.stringify(state.customAnswers),
    asked_price: state.askedPrice,
    date_from: state.dateFrom,
    date_to: state.dateTo,
    situation: state.situation,
    promise_kind: state.promise?.kind ?? null,
    promise_sentence: state.promise?.sentence ?? null,
    promise_due_at: state.promise?.dueAt ?? null,
    promise_made_at: state.promise ? options.promiseMadeAt : null,
    callback_reason: state.callbackReason,
    earlier_tool_results: JSON.stringify(state.earlierToolResults),
  };
  await db
    .insertInto('conversation_facts')
    .values({
      conversation_id: options.conversationId,
      account_id: options.accountId,
      ...values,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.column('conversation_id').doUpdateSet({
        ...values,
        // Keep the first promise's time: only a promise that was not there before gets a time
        promise_made_at: (expressions) =>
          expressions.fn.coalesce('conversation_facts.promise_made_at', expressions.val(values.promise_made_at)),
        updated_by: actorStamp,
      }),
    )
    .execute();
}

/** The saved summary of a conversation and when it was written, or undefined when the conversation has no facts row yet. */
export async function findConversationSummary(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<{ summary: string | null; summarisedAt: Date | null } | undefined> {
  const row = await db
    .selectFrom('conversation_facts')
    .select(['summary', 'summarised_at'])
    .where('account_id', '=', accountId)
    .where('conversation_id', '=', conversationId)
    .executeTakeFirst();
  return row ? { summary: row.summary, summarisedAt: row.summarised_at } : undefined;
}

/**
 * Saves the summary of a conversation. A conversation the agent never spoke in has no facts row yet, so one is made (with nothing saved in
 * it). Writing it again replaces the earlier summary (a conversation that carried on after it was summarised).
 */
export async function saveConversationSummary(
  db: Db,
  options: { accountId: string; conversationId: string; summary: string; summarisedAt: Date; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('conversation_facts')
    .values({
      conversation_id: options.conversationId,
      account_id: options.accountId,
      details: '{}',
      earlier_tool_results: '[]',
      summary: options.summary,
      summarised_at: options.summarisedAt,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict
        .column('conversation_id')
        .doUpdateSet({ summary: options.summary, summarised_at: options.summarisedAt, updated_by: actorStamp }),
    )
    .execute();
}
