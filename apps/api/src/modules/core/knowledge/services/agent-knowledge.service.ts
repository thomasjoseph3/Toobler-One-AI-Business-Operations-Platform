import { weeklyHoursValueSchema, type WeeklyHoursValue } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import { describeAnswerForAgent } from '../helpers/describe-answer-for-agent';
import { getQuestionsForIndustry } from '../helpers/question-set';
import { resolveSituation } from '../helpers/situation-choices';
import { SITUATIONS } from '../helpers/situations';
import { onlyConfirmedAnswers } from '../helpers/usable-answers';
import * as answersRepository from '../repositories/answers.repository';
import * as situationsRepository from '../repositories/situations.repository';

/** One fact about the business, as a question and its answer in words. */
export interface BusinessFactForTheAgent {
  question: string;
  answer: string;
}

/** How the business wants one common moment handled. */
export interface SituationForTheAgent {
  key: string;
  whenItHappens: string;
  handling: string;
  /** The key of the chosen handling, so code (not the AI) can act on it. */
  handlingKey: string;
}

/** Everything the business has told the AI about itself. */
export interface BusinessKnowledgeForTheAgent {
  facts: BusinessFactForTheAgent[];
  situations: SituationForTheAgent[];
  /** The opening hours as data (for the promise, chosen by code), or undefined when not given or not confirmed. */
  weeklyHours: WeeklyHoursValue | undefined;
}

const OPENING_HOURS_QUESTION_KEY = 'opening_hours';

/**
 * What the business has told the AI: the answers a manager has confirmed (an answer still waiting for a check is never given), each in
 * words, how the business wants the seven common situations handled, and the opening hours as data. The agent reads only this. Runs
 * inside the caller's transaction, which is already fenced to the business.
 */
export async function findBusinessKnowledgeForTheAgent(
  transaction: Db,
  options: { accountId: string; industryId: string },
): Promise<BusinessKnowledgeForTheAgent> {
  const storedAnswers = onlyConfirmedAnswers(await answersRepository.listAnswers(transaction, options.accountId));
  const questions = getQuestionsForIndustry(options.industryId);

  const facts: BusinessFactForTheAgent[] = [];
  let weeklyHours: WeeklyHoursValue | undefined;
  for (const question of questions) {
    // The answers that live in offerings, FAQs or documents are read from there, not from here
    if (question.handledElsewhere) continue;
    const stored = storedAnswers.find((answer) => answer.questionKey === question.key);
    if (!stored) continue;
    const answerInWords = describeAnswerForAgent(question, stored.value);
    if (answerInWords === undefined) continue;
    facts.push({ question: question.text, answer: answerInWords });
    if (question.key === OPENING_HOURS_QUESTION_KEY) {
      const parsedHours = weeklyHoursValueSchema.safeParse(stored.value);
      if (parsedHours.success) weeklyHours = parsedHours.data;
    }
  }

  const savedChoices = await situationsRepository.listSavedChoices(transaction, options.accountId);
  const situations = SITUATIONS.map((definition) => {
    const situation = resolveSituation(
      definition,
      savedChoices.find((saved) => saved.situationKey === definition.key),
    );
    const chosen = situation.choices.find((choice) => choice.key === situation.selectedChoiceKey);
    return {
      key: situation.key,
      whenItHappens: situation.text,
      handling: chosen?.label ?? '',
      handlingKey: situation.selectedChoiceKey,
    };
  });

  return { facts, situations, weeklyHours };
}
