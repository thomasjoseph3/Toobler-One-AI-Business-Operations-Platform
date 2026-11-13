import { sql } from 'kysely';
import type { FaqSource, FaqStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `faqs` table. Every query names the business as well as the id (defence in depth: the database also fences
// every query by business). Removed FAQs (deleted_at set) are left out of every read here.

/** An FAQ as the database holds it. The service turns it into the API's Faq. */
export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  status: FaqStatus;
  source: FaqSource;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a database row of `faqs` into a FaqRow. */
function toFaqRow(row: {
  id: string;
  question: string;
  answer: string;
  status: FaqStatus;
  source: FaqSource;
  created_at: Date;
  updated_at: Date;
}): FaqRow {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Makes the business's other FAQ changes wait their turn until the end of this transaction, so two people adding the same
 * question at the same moment cannot both pass the duplicate check.
 */
export async function lockFaqsOfBusiness(db: Db, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`faqs:${accountId}`}))`.execute(db);
}

/** Adds an FAQ. Fails with a unique error when a live FAQ already has the same question (ignoring capitals). */
export async function insertFaq(
  db: Db,
  faq: {
    id: string;
    accountId: string;
    question: string;
    answer: string;
    status: FaqStatus;
    source: FaqSource;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: faq.actor.kind, id: faq.actor.id };
  await db
    .insertInto('faqs')
    .values({
      id: faq.id,
      account_id: faq.accountId,
      question: faq.question,
      answer: faq.answer,
      status: faq.status,
      source: faq.source,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** The business's live FAQs, newest first, optionally only the ones with the given status. */
export async function listFaqs(
  db: Db,
  accountId: string,
  options: { status?: FaqStatus | undefined } = {},
): Promise<FaqRow[]> {
  let query = db.selectFrom('faqs').selectAll().where('account_id', '=', accountId).where('deleted_at', 'is', null);
  if (options.status !== undefined) query = query.where('status', '=', options.status);
  const rows = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').execute();
  return rows.map(toFaqRow);
}

/** One live FAQ of the business, or undefined when the id is unknown, removed, or another business's. */
export async function findFaqById(db: Db, accountId: string, faqId: string): Promise<FaqRow | undefined> {
  const row = await db
    .selectFrom('faqs')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', faqId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toFaqRow(row) : undefined;
}

/** The business's live FAQ with this question (ignoring capitals), or undefined. */
export async function findFaqByQuestion(db: Db, accountId: string, question: string): Promise<FaqRow | undefined> {
  const row = await db
    .selectFrom('faqs')
    .selectAll()
    .where('account_id', '=', accountId)
    .where(sql<boolean>`lower(question) = lower(${question})`)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toFaqRow(row) : undefined;
}

/** Locks one live FAQ until the end of the transaction, so two people changing it at the same moment take turns. Returns false when the id is unknown, removed, or another business's. */
export async function lockFaqForUpdate(db: Db, accountId: string, faqId: string): Promise<boolean> {
  const row = await db
    .selectFrom('faqs')
    .select('id')
    .where('account_id', '=', accountId)
    .where('id', '=', faqId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  return row !== undefined;
}

/** Changes the question and/or answer of one live FAQ. A field that is left out is not touched. Fails with a unique error when another live FAQ has the same question. */
export async function updateFaq(
  db: Db,
  options: { accountId: string; faqId: string; changes: { question?: string; answer?: string }; actor: Actor },
): Promise<void> {
  const { changes } = options;
  await db
    .updateTable('faqs')
    .set({
      ...(changes.question !== undefined ? { question: changes.question } : {}),
      ...(changes.answer !== undefined ? { answer: changes.answer } : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.faqId)
    .where('deleted_at', 'is', null)
    .execute();
}

/** Removes an FAQ from view (a soft delete: the row stays, so the history can still be read). */
export async function softDeleteFaq(
  db: Db,
  options: { accountId: string; faqId: string; actor: Actor; now: Date },
): Promise<void> {
  await db
    .updateTable('faqs')
    .set({ deleted_at: options.now, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.faqId)
    .where('deleted_at', 'is', null)
    .execute();
}
