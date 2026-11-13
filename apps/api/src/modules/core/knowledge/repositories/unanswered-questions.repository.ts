import { sql } from 'kysely';
import type { UnansweredQuestionStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `unanswered_questions` table. Every query names the business as well as the id (defence in depth: the database also
// fences every query by business).

/** An unanswered question as the database holds it. The service turns it into the API's UnansweredQuestion. */
export interface UnansweredQuestionRow {
  id: string;
  question: string;
  count: number;
  lastAskedAt: Date;
  status: UnansweredQuestionStatus;
  faqId: string | null;
  createdAt: Date;
}

/** Turns a database row of `unanswered_questions` into an UnansweredQuestionRow, working out its status. */
function toUnansweredQuestionRow(row: {
  id: string;
  question: string;
  count: number;
  last_asked_at: Date;
  answered_at: Date | null;
  faq_id: string | null;
  ignored_at: Date | null;
  created_at: Date;
}): UnansweredQuestionRow {
  const status: UnansweredQuestionStatus =
    row.answered_at !== null ? 'answered' : row.ignored_at !== null ? 'ignored' : 'open';
  return {
    id: row.id,
    question: row.question,
    count: row.count,
    lastAskedAt: row.last_asked_at,
    status,
    faqId: row.faq_id,
    createdAt: row.created_at,
  };
}

/**
 * Records that a customer asked this question: a new row the first time, otherwise one more on the count of the row that has the same
 * group key (one statement, so two customers asking at the same moment are both counted). Returns the row's id, its count now, and
 * whether this ask created the row.
 */
export async function recordQuestionAsked(
  db: Db,
  options: { id: string; accountId: string; question: string; groupKey: string; actor: Actor; now: Date },
): Promise<{ id: string; count: number; wasCreated: boolean }> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const row = await db
    .insertInto('unanswered_questions')
    .values({
      id: options.id,
      account_id: options.accountId,
      question: options.question,
      group_key: options.groupKey,
      count: 1,
      last_asked_at: options.now,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'group_key']).doUpdateSet({
        count: sql`unanswered_questions.count + 1`,
        last_asked_at: options.now,
        updated_by: actorStamp,
      }),
    )
    // A row that was just inserted has no earlier version, which Postgres shows as xmax = 0
    .returning(['id', 'count', sql<boolean>`(xmax = 0)`.as('was_created')])
    .executeTakeFirstOrThrow();
  return { id: row.id, count: row.count, wasCreated: row.was_created };
}

/** The business's unanswered questions, most asked first. Only the open ones unless `includeHistory` is true. */
export async function listUnansweredQuestions(
  db: Db,
  accountId: string,
  options: { includeHistory: boolean },
): Promise<UnansweredQuestionRow[]> {
  let query = db.selectFrom('unanswered_questions').selectAll().where('account_id', '=', accountId);
  if (!options.includeHistory) query = query.where('answered_at', 'is', null).where('ignored_at', 'is', null);
  const rows = await query.orderBy('count', 'desc').orderBy('last_asked_at', 'desc').orderBy('id', 'desc').execute();
  return rows.map(toUnansweredQuestionRow);
}
