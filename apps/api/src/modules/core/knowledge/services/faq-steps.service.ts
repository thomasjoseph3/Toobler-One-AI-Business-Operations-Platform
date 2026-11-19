import type { Faq, FaqSource } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { conflict } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import * as faqsRepository from '../repositories/faqs.repository';
import type { FaqRow } from '../repositories/faqs.repository';

// Steps that more than one service needs when it creates or changes an FAQ: the FAQ service (typed in) and the unanswered questions
// service (answered from a question). Kept here so the rules are written once.

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a database row into the Faq the API answers with. */
export function toFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Adds a usable (`confirmed`) FAQ inside the caller's transaction, with its activity-log line and `faq.created` event (ids and field
 * names only, never the words). Takes the business's FAQ lock first, so two adds of one question take turns. Fails with a unique error
 * when a live FAQ already has the question (see `rethrowAsDuplicateFaqIfClash`). Returns the new FAQ's id.
 */
export async function createFaqInTransaction(
  transaction: Db,
  options: { accountId: string; actor: Actor; question: string; answer: string; source: FaqSource },
): Promise<string> {
  const { accountId, actor } = options;
  await faqsRepository.lockFaqsOfBusiness(transaction, accountId);
  const faqId = uuidv7();
  await faqsRepository.insertFaq(transaction, {
    id: faqId,
    accountId,
    question: options.question,
    answer: options.answer,
    status: 'confirmed',
    source: options.source,
    actor,
  });
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: 'knowledge.faq_created',
    // Which fields were filled in, never their words
    details: { recordType: 'faq', recordId: faqId, fields: ['question', 'answer'] },
  });
  await publishEvent(transaction, { accountId, eventName: 'faq.created', payload: { faqId, source: options.source } });
  return faqId;
}

/**
 * Called from a `catch`: when the error is the database refusing a second live FAQ with the same question, throws 409 FAQ_EXISTS
 * naming the FAQ that already has it (looked up in a new transaction, because the failed one is gone). Any other error is thrown
 * again unchanged.
 */
export async function rethrowAsDuplicateFaqIfClash(
  database: Database,
  accountId: string,
  question: string,
  error: unknown,
): Promise<never> {
  const isUniqueViolation = error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION;
  if (!isUniqueViolation) throw error;
  const existing = await database.runInAccountTransaction(accountId, (transaction) =>
    faqsRepository.findFaqByQuestion(transaction, accountId, question),
  );
  throw conflict(
    'FAQ_EXISTS',
    'You already have an FAQ with this question.',
    existing ? { faqId: existing.id } : undefined,
  );
}
