import type { AnswerSource, AnswerStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `business_answers` table (one row per business and question). Every query names the business as well as
// the question (defence in depth: the database also fences every query by business).

/** An answer as the database holds it. */
export interface AnswerRow {
  questionKey: string;
  value: unknown;
  source: AnswerSource;
  status: AnswerStatus;
  confirmedAt: Date | null;
  updatedAt: Date;
}

/** All the business's answers, in no particular order. */
export async function listAnswers(db: Db, accountId: string): Promise<AnswerRow[]> {
  const rows = await db
    .selectFrom('business_answers')
    .select(['question_key', 'value', 'source', 'status', 'confirmed_at', 'updated_at'])
    .where('account_id', '=', accountId)
    .execute();
  return rows.map((row) => ({
    questionKey: row.question_key,
    value: row.value,
    source: row.source,
    status: row.status,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Locks one answer row, if it exists, until the end of the transaction, and returns it. Two managers changing the same
 * answer at the same moment take turns. Undefined when the question has not been answered yet.
 */
export async function lockAnswer(db: Db, accountId: string, questionKey: string): Promise<AnswerRow | undefined> {
  const row = await db
    .selectFrom('business_answers')
    .select(['question_key', 'value', 'source', 'status', 'confirmed_at', 'updated_at'])
    .where('account_id', '=', accountId)
    .where('question_key', '=', questionKey)
    .forUpdate()
    .executeTakeFirst();
  return row
    ? {
        questionKey: row.question_key,
        value: row.value,
        source: row.source,
        status: row.status,
        confirmedAt: row.confirmed_at,
        updatedAt: row.updated_at,
      }
    : undefined;
}

/**
 * Saves a typed answer: adds it, or replaces the earlier one. A typed answer is confirmed at once, by the person who typed
 * it, and loses any earlier source (a website, say) because the person has now written it themselves.
 */
export async function saveTypedAnswer(
  db: Db,
  options: { accountId: string; questionKey: string; value: unknown; actor: Actor; now: Date },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('business_answers')
    .values({
      account_id: options.accountId,
      question_key: options.questionKey,
      value: JSON.stringify(options.value),
      source: 'typed',
      source_ref: null,
      status: 'confirmed',
      confirmed_by: actorStamp,
      confirmed_at: options.now,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'question_key']).doUpdateSet({
        value: JSON.stringify(options.value),
        source: 'typed',
        source_ref: null,
        status: 'confirmed',
        confirmed_by: actorStamp,
        confirmed_at: options.now,
        updated_by: actorStamp,
      }),
    )
    .execute();
}
