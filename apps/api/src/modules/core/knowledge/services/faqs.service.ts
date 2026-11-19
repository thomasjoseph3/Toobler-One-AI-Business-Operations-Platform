import type { CreateFaqRequest, Faq, FaqsResponse, ListFaqsQuery, UpdateFaqRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import * as faqsRepository from '../repositories/faqs.repository';
import * as unansweredQuestionsRepository from '../repositories/unanswered-questions.repository';
import { createFaqInTransaction, rethrowAsDuplicateFaqIfClash, toFaq } from './faq-steps.service';

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
          const faqId = await createFaqInTransaction(transaction, {
            accountId,
            actor,
            question: request.question,
            answer: request.answer,
            source: 'typed',
          });
          const saved = await faqsRepository.findFaqById(transaction, accountId, faqId);
          if (!saved) throw new Error('The FAQ that was just saved cannot be read');
          return toFaq(saved);
        });
      } catch (error) {
        return rethrowAsDuplicateFaqIfClash(database, accountId, request.question, error);
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
        return rethrowAsDuplicateFaqIfClash(database, accountId, request.question ?? '', error);
      }
    },

    /**
     * Removes an FAQ: it disappears from the list (and later from search); its row is kept. An unknown, already removed or other
     * business's FAQ answers 404. A question that was answered by this FAQ becomes open again. Writes an activity-log line and the `faq.deleted` event (ids only).
     */
    async deleteFaq(principal: Pick<Principal, 'accountId' | 'userId'>, faqId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await faqsRepository.lockFaqForUpdate(transaction, accountId, faqId))) throw notFound('That FAQ');
        await faqsRepository.softDeleteFaq(transaction, { accountId, faqId, actor, now: new Date() });
        // A question that was answered by this FAQ has no answer any more, so it goes back to the open list
        await unansweredQuestionsRepository.reopenQuestionsAnsweredBy(transaction, { accountId, faqId, actor });
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
