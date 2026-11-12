import type { AnswerStatus } from '@toobler-one/shared';
import type { QuestionDefinition } from './question-types';

// The completeness score and the go-live check. Pure: no database, no AI (the AI never does maths).

/** An answer as these functions need to know it. */
export interface AnswerSummary {
  questionKey: string;
  status: AnswerStatus;
}

export interface ProfileProgress {
  /** How many questions count (the ones answered here, not in offerings, FAQs or documents). */
  totalQuestions: number;
  /** How many of them have a confirmed answer. */
  answeredQuestions: number;
  /** How many have an answer still waiting for a manager to confirm it. */
  waitingForCheck: number;
  /** answeredQuestions out of totalQuestions, as a whole percent. */
  percentComplete: number;
  /** The questions with no confirmed answer, the "needed to go live" ones first, then in the order of the list. */
  stillToAnswer: string[];
  /** True when every "needed to go live" question has a confirmed answer. */
  readyToGoLive: boolean;
  /** The "needed to go live" questions that still have no confirmed answer. */
  neededToGoLiveStillMissing: string[];
}

/** Works out how complete the business's profile is. Only confirmed answers count. */
export function computeProfileProgress(
  questions: readonly QuestionDefinition[],
  answers: readonly AnswerSummary[],
): ProfileProgress {
  const countedQuestions = questions.filter((question) => !question.handledElsewhere);
  const statusByKey = new Map(answers.map((answer) => [answer.questionKey, answer.status]));

  const unanswered = countedQuestions.filter((question) => statusByKey.get(question.key) !== 'confirmed');
  const neededMissing = unanswered.filter((question) => question.neededToGoLive);
  const otherMissing = unanswered.filter((question) => !question.neededToGoLive);

  const answeredQuestions = countedQuestions.length - unanswered.length;
  const waitingForCheck = countedQuestions.filter((question) => statusByKey.get(question.key) === 'check').length;
  return {
    totalQuestions: countedQuestions.length,
    answeredQuestions,
    waitingForCheck,
    percentComplete:
      countedQuestions.length === 0 ? 100 : Math.round((answeredQuestions / countedQuestions.length) * 100),
    stillToAnswer: [...neededMissing, ...otherMissing].map((question) => question.key),
    readyToGoLive: neededMissing.length === 0,
    neededToGoLiveStillMissing: neededMissing.map((question) => question.key),
  };
}
