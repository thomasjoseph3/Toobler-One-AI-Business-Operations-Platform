import type {
  AnswerUnansweredQuestionRequest,
  Faq,
  ListUnansweredQuestionsQuery,
  UnansweredQuestion,
  UnansweredQuestionsResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as faqsRepository from '../repositories/faqs.repository';
import { tidyUnansweredQuestion } from '../helpers/tidy-unanswered-question';
import * as unansweredQuestionsRepository from '../repositories/unanswered-questions.repository';
import type { UnansweredQuestionRow } from '../repositories/unanswered-questions.repository';
import { createFaqInTransaction, rethrowAsDuplicateFaqIfClash, toFaq } from './faq-steps.service';

/** Turns a database row into the UnansweredQuestion the API answers with. */
function toUnansweredQuestion(row: UnansweredQuestionRow): UnansweredQuestion {
  return {
    id: row.id,
    question: row.question,
    count: row.count,
    lastAskedAt: row.lastAskedAt.toISOString(),
    status: row.status,
    faqId: row.faqId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Throws 409 UNANSWERED_QUESTION_NOT_OPEN unless nobody has dealt with the question yet. */
function requireOpen(question: UnansweredQuestionRow) {
  if (question.status !== 'open') {
    throw conflict('UNANSWERED_QUESTION_NOT_OPEN', 'This question has already been answered or ignored.', {
      status: question.status,
    });
  }
}

/**
 * Everything about unanswered questions that is not plain reading of the database. The routes call the list; the AI agent (F19) calls
 * `logUnansweredQuestion` through the knowledge module's index.
 */
export function createUnansweredQuestionsService({ database }: { database: Database }) {
  return {
    /** The business's unanswered questions, most asked first: the open ones, or with the answered and ignored ones too. */
    async listUnansweredQuestions(
      principal: Pick<Principal, 'accountId'>,
      query: ListUnansweredQuestionsQuery,
    ): Promise<UnansweredQuestionsResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        unansweredQuestionsRepository.listUnansweredQuestions(transaction, principal.accountId, {
          includeHistory: query.include === 'history',
        }),
      );
      return { items: rows.map(toUnansweredQuestion) };
    },

    /**
     * Records a question the AI could not answer. The text is tidied first (spaces, emails and phone numbers blanked out, cut to 300
     * characters). The same question asked again (ignoring capitals and punctuation) adds one to its count instead of a new row.
     * A new question also writes an activity-log line and the `unanswered_question.logged` event (ids only, never the words).
     * Returns the row's id and count, or null when the text has nothing meaningful in it.
     */
    async logUnansweredQuestion(
      accountId: string,
      actor: Actor,
      rawText: string,
    ): Promise<{ id: string; count: number } | null> {
      const tidied = tidyUnansweredQuestion(rawText);
      if (!tidied) return null;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const recorded = await unansweredQuestionsRepository.recordQuestionAsked(transaction, {
          id: uuidv7(),
          accountId,
          question: tidied.question,
          groupKey: tidied.groupKey,
          actor,
          now: new Date(),
        });
        if (recorded.wasCreated) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.unanswered_question_logged',
            details: { recordType: 'unanswered_question', recordId: recorded.id, fields: ['question'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'unanswered_question.logged',
            payload: { unansweredQuestionId: recorded.id },
          });
        }
        return { id: recorded.id, count: recorded.count };
      });
    },

    /**
     * Answers an open question: the answer (and the question, as first asked or as the person reworded it) becomes a new usable FAQ
     * with source `unanswered`, and the question is closed as answered, in one step. Writes the activity-log lines and events (ids
     * only). An unknown or other business's question answers 404; one already answered or ignored answers 409
     * UNANSWERED_QUESTION_NOT_OPEN; a question a live FAQ already has answers 409 FAQ_EXISTS. Answers with the new FAQ.
     */
    async answerUnansweredQuestion(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      unansweredQuestionId: string,
      request: AnswerUnansweredQuestionRequest,
    ): Promise<Faq> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      let questionOfFaq = request.question ?? ''; // for the "already exists" answer; filled in once the question is read
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Two people answering one question at the same moment take turns
          const current = await unansweredQuestionsRepository.lockUnansweredQuestionForUpdate(
            transaction,
            accountId,
            unansweredQuestionId,
          );
          if (!current) throw notFound('That question');
          requireOpen(current);
          questionOfFaq = request.question ?? current.question;

          const faqId = await createFaqInTransaction(transaction, {
            accountId,
            actor,
            question: questionOfFaq,
            answer: request.answer,
            source: 'unanswered',
          });
          await unansweredQuestionsRepository.markAnswered(transaction, {
            accountId,
            unansweredQuestionId,
            faqId,
            actor,
            now: new Date(),
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.unanswered_question_answered',
            details: { recordType: 'unanswered_question', recordId: unansweredQuestionId },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'unanswered_question.answered',
            payload: { unansweredQuestionId, faqId },
          });
          const saved = await faqsRepository.findFaqById(transaction, accountId, faqId);
          if (!saved) throw new Error('The FAQ that was just saved cannot be read');
          return toFaq(saved);
        });
      } catch (error) {
        return rethrowAsDuplicateFaqIfClash(database, accountId, questionOfFaq, error);
      }
    },

    /**
     * Ignores an open question: it leaves the open list (and stays in the history). An unknown or other business's question answers
     * 404; one already answered or ignored answers 409 UNANSWERED_QUESTION_NOT_OPEN. Writes an activity-log line and an event (ids
     * only). Answers with the question.
     */
    async dismissUnansweredQuestion(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      unansweredQuestionId: string,
    ): Promise<UnansweredQuestion> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await unansweredQuestionsRepository.lockUnansweredQuestionForUpdate(
          transaction,
          accountId,
          unansweredQuestionId,
        );
        if (!current) throw notFound('That question');
        requireOpen(current);
        await unansweredQuestionsRepository.markIgnored(transaction, {
          accountId,
          unansweredQuestionId,
          actor,
          now: new Date(),
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'knowledge.unanswered_question_ignored',
          details: { recordType: 'unanswered_question', recordId: unansweredQuestionId },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'unanswered_question.ignored',
          payload: { unansweredQuestionId },
        });
        const saved = await unansweredQuestionsRepository.findUnansweredQuestionById(
          transaction,
          accountId,
          unansweredQuestionId,
        );
        if (!saved) throw new Error('The question that was just ignored cannot be read');
        return toUnansweredQuestion(saved);
      });
    },
  };
}
