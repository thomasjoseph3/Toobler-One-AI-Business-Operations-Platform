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
 * group key (one statement, so two customers asking at the same moment are both counted). Returns the row's id, its count now, whether
 * this ask created the row, and the row it was joined into by the nightly job (null if it was not): the caller then counts the ask there.
 */
export async function recordQuestionAsked(
  db: Db,
  options: { id: string; accountId: string; question: string; groupKey: string; actor: Actor; now: Date },
): Promise<{ id: string; count: number; wasCreated: boolean; mergedIntoId: string | null }> {
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
    .returning(['id', 'count', 'merged_into_id', sql<boolean>`(xmax = 0)`.as('was_created')])
    .executeTakeFirstOrThrow();
  return { id: row.id, count: row.count, wasCreated: row.was_created, mergedIntoId: row.merged_into_id };
}

/**
 * Locks one unanswered question until the end of the transaction, so two people answering or ignoring it at the same moment take
 * turns, and returns it. Returns undefined when the id is unknown or another business's.
 */
export async function lockUnansweredQuestionForUpdate(
  db: Db,
  accountId: string,
  unansweredQuestionId: string,
): Promise<UnansweredQuestionRow | undefined> {
  const row = await db
    .selectFrom('unanswered_questions')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', unansweredQuestionId)
    .where('merged_into_id', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  return row ? toUnansweredQuestionRow(row) : undefined;
}

/** One unanswered question of the business, or undefined when the id is unknown or another business's. */
export async function findUnansweredQuestionById(
  db: Db,
  accountId: string,
  unansweredQuestionId: string,
): Promise<UnansweredQuestionRow | undefined> {
  const row = await db
    .selectFrom('unanswered_questions')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', unansweredQuestionId)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  return row ? toUnansweredQuestionRow(row) : undefined;
}

/** Closes an open question as answered by the given FAQ. */
export async function markAnswered(
  db: Db,
  options: { accountId: string; unansweredQuestionId: string; faqId: string; actor: Actor; now: Date },
): Promise<void> {
  await db
    .updateTable('unanswered_questions')
    .set({
      answered_at: options.now,
      faq_id: options.faqId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.unansweredQuestionId)
    .execute();
}

/** Closes an open question as ignored. */
export async function markIgnored(
  db: Db,
  options: { accountId: string; unansweredQuestionId: string; actor: Actor; now: Date },
): Promise<void> {
  await db
    .updateTable('unanswered_questions')
    .set({ ignored_at: options.now, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.unansweredQuestionId)
    .execute();
}

/** Opens again every question that was answered by this FAQ (used when the FAQ is removed). */
export async function reopenQuestionsAnsweredBy(
  db: Db,
  options: { accountId: string; faqId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('unanswered_questions')
    .set({ answered_at: null, faq_id: null, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('faq_id', '=', options.faqId)
    .execute();
}

/** Adds one to the count of a question and marks it asked now (used when a customer asks a question that was joined into this one). */
export async function addOneAsk(
  db: Db,
  options: { accountId: string; unansweredQuestionId: string; actor: Actor; now: Date },
): Promise<{ id: string; count: number }> {
  return db
    .updateTable('unanswered_questions')
    .set({
      count: sql`count + 1`,
      last_asked_at: options.now,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.unansweredQuestionId)
    .returning(['id', 'count'])
    .executeTakeFirstOrThrow();
}

/** An open question with the key made of its meaningful words (the root form of each, sorted), worked out by the database. */
export interface OpenQuestionWithWordKey {
  id: string;
  count: number;
  lastAskedAt: Date;
  createdAt: Date;
  wordKey: string;
}

/**
 * Locks and returns the business's open questions (not answered, ignored or already joined) with their word keys, so a merge sees a
 * steady list while it works. Business-wide advisory lock first: two merges of one business take turns.
 */
export async function lockOpenQuestionsWithWordKey(db: Db, accountId: string): Promise<OpenQuestionWithWordKey[]> {
  await sql`select pg_advisory_xact_lock(hashtext(${`unanswered_questions:${accountId}`}))`.execute(db);
  const result = await sql<{
    id: string;
    count: number;
    last_asked_at: Date;
    created_at: Date;
    word_key: string;
  }>`
    select
      question.id,
      question.count,
      question.last_asked_at,
      question.created_at,
      coalesce(
        (select string_agg(distinct lexeme, ' ' order by lexeme) from unnest(to_tsvector('english', question.question))),
        ''
      ) as word_key
    from unanswered_questions as question
    where question.account_id = ${accountId}
      and question.answered_at is null
      and question.ignored_at is null
      and question.merged_into_id is null
    order by question.id
    for update`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    count: row.count,
    lastAskedAt: row.last_asked_at,
    createdAt: row.created_at,
    wordKey: row.word_key,
  }));
}

/**
 * Joins questions into one: the keeper takes over the total count and the latest time, each joined question points at the keeper
 * (and stays hidden), and any question that was joined into one of them now points at the keeper too.
 */
export async function mergeQuestionsInto(
  db: Db,
  options: {
    accountId: string;
    keeperId: string;
    absorbedIds: string[];
    totalCount: number;
    lastAskedAt: Date;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .updateTable('unanswered_questions')
    .set({ count: options.totalCount, last_asked_at: options.lastAskedAt, updated_by: actorStamp })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.keeperId)
    .execute();
  await db
    .updateTable('unanswered_questions')
    .set({ merged_into_id: options.keeperId, updated_by: actorStamp })
    .where('account_id', '=', options.accountId)
    .where('id', 'in', options.absorbedIds)
    .execute();
  await db
    .updateTable('unanswered_questions')
    .set({ merged_into_id: options.keeperId, updated_by: actorStamp })
    .where('account_id', '=', options.accountId)
    .where('merged_into_id', 'in', options.absorbedIds)
    .execute();
}

/** The business's unanswered questions, most asked first. Only the open ones unless `includeHistory` is true. */
export async function listUnansweredQuestions(
  db: Db,
  accountId: string,
  options: { includeHistory: boolean },
): Promise<UnansweredQuestionRow[]> {
  let query = db
    .selectFrom('unanswered_questions')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('merged_into_id', 'is', null);
  if (!options.includeHistory) query = query.where('answered_at', 'is', null).where('ignored_at', 'is', null);
  const rows = await query.orderBy('count', 'desc').orderBy('last_asked_at', 'desc').orderBy('id', 'desc').execute();
  return rows.map(toUnansweredQuestionRow);
}
