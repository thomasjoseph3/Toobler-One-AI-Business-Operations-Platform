import type {
  AnswerType,
  ConfirmAnswersRequest,
  ConfirmAnswersResponse,
  KnowledgeQuestion,
  KnowledgeQuestionsResponse,
  ProfileProgress,
  PutAnswerRequest,
  PutAnswerResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { checkAnswer } from '../helpers/answer-validation';
import { computeProfileProgress } from '../helpers/completeness';
import type { QuestionDefinition } from '../helpers/question-types';
import { findQuestionForIndustry, getQuestionsForIndustry } from '../helpers/question-set';
import { sameJson } from '../helpers/same-json';
import * as answersRepository from '../repositories/answers.repository';
import type { AnswerRow } from '../repositories/answers.repository';

/** Turns a question of the list, plus the business's answer to it (if any), into what the API answers with. */
function toKnowledgeQuestion(question: QuestionDefinition, answer: AnswerRow | undefined): KnowledgeQuestion {
  return {
    key: question.key,
    section: question.section,
    text: question.text,
    type: question.type as AnswerType,
    options: question.options ? [...question.options] : null,
    allowOther: question.allowOther === true,
    maxChoices: question.maxChoices ?? null,
    yesDetail: question.yesDetail ?? null,
    rowFields: question.rowFields
      ? question.rowFields.map((field) => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          options: field.options ? [...field.options] : null,
          required: field.required,
        }))
      : null,
    maxRows: question.maxRows ?? null,
    neededToGoLive: question.neededToGoLive,
    handledElsewhere: question.handledElsewhere ?? null,
    usedFor: question.usedFor ?? null,
    answer: answer
      ? {
          value: answer.value as never,
          source: answer.source,
          status: answer.status,
          confirmedAt: answer.confirmedAt?.toISOString() ?? null,
          updatedAt: answer.updatedAt.toISOString(),
        }
      : null,
  };
}

/** How complete the profile is, from the business's questions and answers. */
function progressOf(questions: readonly QuestionDefinition[], answers: readonly AnswerRow[]): ProfileProgress {
  return computeProfileProgress(
    questions,
    answers.map((answer) => ({ questionKey: answer.questionKey, status: answer.status })),
  );
}

/**
 * Everything about the business profile that is not plain reading of the database. The routes call this.
 * The questions a business answers depend on its industry, which comes from the signed-in person (never from the request).
 */
export function createKnowledgeService({ database }: { database: Database }) {
  return {
    /**
     * The business questions for this business's industry (the general ones, then its industry's extras), each with its
     * answer or null, and how complete the profile is. Staff can read; only the answers of this business are ever shown.
     */
    async listQuestions(principal: Pick<Principal, 'accountId' | 'industryId'>): Promise<KnowledgeQuestionsResponse> {
      const questions = getQuestionsForIndustry(principal.industryId);
      const answers = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        answersRepository.listAnswers(transaction, principal.accountId),
      );
      const answerByKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
      return {
        questions: questions.map((question) => toKnowledgeQuestion(question, answerByKey.get(question.key))),
        progress: progressOf(questions, answers),
      };
    },

    /**
     * Answers or changes one question. The question must be one of this business's own (an unknown key, or an extra of
     * another industry, answers 404). The value is checked against the question: a wrong shape, a wrong option, a bad link
     * or a question answered in another feature gives 400 INVALID_ANSWER with a message in plain words. A typed answer is
     * confirmed straight away. Sending the answer already stored changes nothing and writes no log line. Answers with the
     * question and the new progress.
     */
    async answerQuestion(
      principal: Pick<Principal, 'accountId' | 'userId' | 'industryId'>,
      questionKey: string,
      request: PutAnswerRequest,
    ): Promise<PutAnswerResponse> {
      const question = findQuestionForIndustry(principal.industryId, questionKey);
      if (!question) throw notFound('That question');

      const checked = checkAnswer(question, request.value);
      if (!checked.ok) throw new ApiError(400, 'INVALID_ANSWER', checked.message);

      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const questions = getQuestionsForIndustry(principal.industryId);

      return database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await answersRepository.lockAnswer(transaction, accountId, questionKey);
        const alreadyThere =
          current !== undefined && current.status === 'confirmed' && sameJson(current.value, checked.value);
        if (!alreadyThere) {
          await answersRepository.saveTypedAnswer(transaction, {
            accountId,
            questionKey,
            value: checked.value,
            actor,
            now: new Date(),
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.answer_saved',
            // Which question was answered, never the answer itself
            details: { recordType: 'business_answer', fields: [questionKey] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'knowledge.answer_saved',
            payload: { questionKey },
          });
        }
        const answers = await answersRepository.listAnswers(transaction, accountId);
        const saved = answers.find((answer) => answer.questionKey === questionKey);
        return {
          question: toKnowledgeQuestion(question, saved),
          progress: progressOf(questions, answers),
        };
      });
    },

    /**
     * Confirms answers that are waiting for a check (filled in by the system, not yet accepted by a manager). All the keys must
     * be questions of this business's own list and must already have an answer, or nothing is confirmed and the answer is 404
     * (all or none). An answer that is already confirmed is left as it is. Writes one activity-log line and one event, only
     * when something was really confirmed. Answers with the keys really confirmed, and the new progress.
     */
    async confirmAnswers(
      principal: Pick<Principal, 'accountId' | 'userId' | 'industryId'>,
      request: ConfirmAnswersRequest,
    ): Promise<ConfirmAnswersResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const questions = getQuestionsForIndustry(principal.industryId);
      const knownKeys = new Set(questions.map((question) => question.key));
      const questionKeys = [...new Set(request.questionKeys)];
      if (questionKeys.some((questionKey) => !knownKeys.has(questionKey))) throw notFound('That question');

      return database.runInAccountTransaction(accountId, async (transaction) => {
        const existing = await answersRepository.lockAnswersByKeys(transaction, accountId, questionKeys);
        if (existing.length !== questionKeys.length) throw notFound('That answer');

        const confirmed = await answersRepository.confirmWaitingAnswers(transaction, {
          accountId,
          questionKeys,
          actor,
          now: new Date(),
        });
        if (confirmed.length > 0) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.answers_confirmed',
            // Which questions were confirmed, never the answers
            details: { recordType: 'business_answer', fields: confirmed },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'knowledge.answers_confirmed',
            payload: { questionKeys: confirmed },
          });
        }
        const answers = await answersRepository.listAnswers(transaction, accountId);
        return { confirmed, progress: progressOf(questions, answers) };
      });
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
