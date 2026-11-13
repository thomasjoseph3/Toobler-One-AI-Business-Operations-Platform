import type {
  UnansweredQuestion,
  UnansweredQuestionsResponse,
  ListUnansweredQuestionsQuery,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { tidyUnansweredQuestion } from '../helpers/tidy-unanswered-question';
import * as unansweredQuestionsRepository from '../repositories/unanswered-questions.repository';
import type { UnansweredQuestionRow } from '../repositories/unanswered-questions.repository';

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
  };
}
