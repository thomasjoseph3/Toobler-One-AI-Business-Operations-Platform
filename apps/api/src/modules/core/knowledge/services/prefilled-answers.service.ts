import type { AnswerSource } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { checkAnswer } from '../helpers/answer-validation';
import type { QuestionDefinition } from '../helpers/question-types';
import { findQuestionForIndustry, getQuestionsForIndustry } from '../helpers/question-set';
import * as answersRepository from '../repositories/answers.repository';

/** The kinds of answer the system can read from words on a page. A list or a pick still has to match its question's own rules. */
const READABLE_ANSWER_TYPES: ReadonlySet<QuestionDefinition['type']> = new Set([
  'short_text',
  'long_text',
  'pick_one',
  'pick_several',
  'yes_no',
  'weekly_hours',
  'list',
]);

/** The questions a website or listing can fill in for this kind of business: ones that list a website or listing as a place to look and are answered in the profile. */
export function listPrefillableQuestions(industryId: string): QuestionDefinition[] {
  return getQuestionsForIndustry(industryId).filter(
    (question) =>
      !question.handledElsewhere &&
      READABLE_ANSWER_TYPES.has(question.type) &&
      (question.prefillFrom.includes('website') || question.prefillFrom.includes('listing')),
  );
}

export interface PrefilledAnswer {
  questionKey: string;
  value: unknown;
}

export interface SavePrefilledAnswersResult {
  /** The questions that now have an answer waiting for the owner's check. */
  saved: string[];
  /** Left alone because the owner had already confirmed an answer. */
  skippedBecauseConfirmed: string[];
  /** Left out because the question is not one this business can have filled in, or the answer did not fit the question. */
  rejected: string[];
}

/**
 * Saves answers the system read from a website or listing. Each one is checked against its own question, saved as "waiting for a
 * check" and never used by the AI until the owner confirms it. An answer the owner already confirmed is never changed. Used by
 * the setup wizard's reading job.
 */
export function createPrefilledAnswersService({ database }: { database: Database }) {
  return {
    async saveWaitingAnswers(input: {
      accountId: string;
      industryId: string;
      actor: Actor;
      source: Exclude<AnswerSource, 'typed'>;
      /** Where it was read: the website address or the listing's name. Shown to the owner as "From your website". */
      sourceReference: string;
      answers: readonly PrefilledAnswer[];
    }): Promise<SavePrefilledAnswersResult> {
      const prefillableKeys = new Set(listPrefillableQuestions(input.industryId).map((question) => question.key));
      const result: SavePrefilledAnswersResult = { saved: [], skippedBecauseConfirmed: [], rejected: [] };

      await database.runInAccountTransaction(input.accountId, async (transaction) => {
        for (const answer of input.answers) {
          const question = findQuestionForIndustry(input.industryId, answer.questionKey);
          if (!question || !prefillableKeys.has(question.key)) {
            result.rejected.push(answer.questionKey);
            continue;
          }
          const checked = checkAnswer(question, answer.value);
          if (!checked.ok) {
            result.rejected.push(answer.questionKey);
            continue;
          }
          const wasSaved = await answersRepository.saveWaitingAnswer(transaction, {
            accountId: input.accountId,
            questionKey: question.key,
            value: checked.value,
            source: input.source,
            sourceReference: input.sourceReference.slice(0, 500),
            actor: input.actor,
          });
          (wasSaved ? result.saved : result.skippedBecauseConfirmed).push(question.key);
        }
        if (result.saved.length > 0) {
          await writeActivityLog(transaction, {
            accountId: input.accountId,
            actor: input.actor,
            kind: 'knowledge.answers_prefilled',
            // Which questions were filled in, never the answers
            details: { recordType: 'business_answer', fields: result.saved },
          });
          await publishEvent(transaction, {
            accountId: input.accountId,
            eventName: 'knowledge.answers_prefilled',
            payload: { questionKeys: result.saved, source: input.source },
          });
        }
      });
      return result;
    },
  };
}
