import type { CreateFaqRequest, Faq, FaqsResponse, ListFaqsQuery, UpdateFaqRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as faqsRepository from '../repositories/faqs.repository';
import type { FaqRow } from '../repositories/faqs.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** True when the error is the database saying a unique rule was broken. */
const isUniqueViolation = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION;

/** Turns a database row into the Faq the API answers with. */
function toFaq(row: FaqRow): Faq {
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
 * Everything about FAQs that is not plain reading of the database. The routes call this.
 * FAQs are the business's own list (managers write, everyone signed in reads); there is no "own FAQs only" filter.
 */
export function createFaqsService({ database }: { database: Database }) {
  return {
    /** The business's FAQs, newest first. `status` narrows to the confirmed ones or the ones waiting for a check. */
    async listFaqs(principal: Pick<Principal, 'accountId'>, query: ListFaqsQuery): Promise<FaqsResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        faqsRepository.listFaqs(transaction, principal.accountId, { status: query.status }),
      );
      return { items: rows.map(toFaq) };
    },

    /**
     * Adds an FAQ the owner typed: usable at once (`confirmed`, source `typed`). A question a live FAQ already has (ignoring
     * capitals and extra spaces) answers 409 FAQ_EXISTS naming it, so the AI never holds two answers to one question. Two adds of
     * the same question at the same moment take turns, so only one is saved. Writes an activity-log line and the `faq.created`
     * event (ids and field names only, never the words). Answers with the new FAQ.
     */
    async createFaq(principal: Pick<Principal, 'accountId' | 'userId'>, request: CreateFaqRequest): Promise<Faq> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          await faqsRepository.lockFaqsOfBusiness(transaction, accountId);
          const faqId = uuidv7();
          await faqsRepository.insertFaq(transaction, {
            id: faqId,
            accountId,
            question: request.question,
            answer: request.answer,
            status: 'confirmed',
            source: 'typed',
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.faq_created',
            // Which fields were filled in, never their words
            details: { recordType: 'faq', recordId: faqId, fields: ['question', 'answer'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'faq.created',
            payload: { faqId, source: 'typed' },
          });
          const saved = await faqsRepository.findFaqById(transaction, accountId, faqId);
          if (!saved) throw new Error('The FAQ that was just saved cannot be read');
          return toFaq(saved);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another live FAQ has this question. The failed transaction is gone, so look in a new one.
        const existing = await database.runInAccountTransaction(accountId, (transaction) =>
          faqsRepository.findFaqByQuestion(transaction, accountId, request.question),
        );
        throw conflict(
          'FAQ_EXISTS',
          'You already have an FAQ with this question.',
          existing ? { faqId: existing.id } : undefined,
        );
      }
    },

    /**
     * Changes the question and/or answer of an FAQ. Only fields that really change are written; sending the values it already has
     * changes nothing and writes no log line. Sending nothing to change answers 400 NOTHING_TO_CHANGE. A question another live FAQ
     * has answers 409 FAQ_EXISTS; an unknown, removed or other business's FAQ answers 404. Answers with the FAQ.
     */
    async updateFaq(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      faqId: string,
      request: UpdateFaqRequest,
    ): Promise<Faq> {
      if (request.question === undefined && request.answer === undefined) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send a question, an answer, or both.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Two people changing one FAQ at the same moment take turns
          if (!(await faqsRepository.lockFaqForUpdate(transaction, accountId, faqId))) throw notFound('That FAQ');
          const current = await faqsRepository.findFaqById(transaction, accountId, faqId);
          if (!current) throw notFound('That FAQ');

          const changes: { question?: string; answer?: string } = {};
          if (request.question !== undefined && request.question !== current.question)
            changes.question = request.question;
          if (request.answer !== undefined && request.answer !== current.answer) changes.answer = request.answer;

          const changedFields = Object.keys(changes); // the names of the fields that really change
          if (changedFields.length > 0) {
            await faqsRepository.updateFaq(transaction, { accountId, faqId, changes, actor });
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'knowledge.faq_updated',
              // Which fields changed, never their words
              details: { recordType: 'faq', recordId: faqId, fields: changedFields },
            });
            await publishEvent(transaction, {
              accountId,
              eventName: 'faq.updated',
              payload: { faqId, fields: changedFields },
            });
          }
          const saved = await faqsRepository.findFaqById(transaction, accountId, faqId);
          if (!saved) throw new Error('The FAQ that was just changed cannot be read');
          return toFaq(saved);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another live FAQ has this question. The failed transaction is gone, so look in a new one.
        const existing = await database.runInAccountTransaction(accountId, (transaction) =>
          faqsRepository.findFaqByQuestion(transaction, accountId, request.question ?? ''),
        );
        throw conflict(
          'FAQ_EXISTS',
          'You already have an FAQ with this question.',
          existing ? { faqId: existing.id } : undefined,
        );
      }
    },

    /**
     * Removes an FAQ: it disappears from the list (and later from search); its row is kept. An unknown, already removed or other
     * business's FAQ answers 404. Writes an activity-log line and the `faq.deleted` event (ids only).
     */
    async deleteFaq(principal: Pick<Principal, 'accountId' | 'userId'>, faqId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await faqsRepository.lockFaqForUpdate(transaction, accountId, faqId))) throw notFound('That FAQ');
        await faqsRepository.softDeleteFaq(transaction, { accountId, faqId, actor, now: new Date() });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'knowledge.faq_deleted',
          details: { recordType: 'faq', recordId: faqId },
        });
        await publishEvent(transaction, { accountId, eventName: 'faq.deleted', payload: { faqId } });
      });
    },
  };
}
