import { GENERAL_QUESTIONS } from './general-questions';
import { INDUSTRY_QUESTIONS } from './industry-questions';
import type { QuestionDefinition } from './question-types';

/**
 * The questions one business answers: the general ones, then the extras of its industry (an industry with no extras, such as
 * "general" or "other", gets the general ones only). Pure: no database.
 */
export function getQuestionsForIndustry(industryId: string): readonly QuestionDefinition[] {
  return [...GENERAL_QUESTIONS, ...(INDUSTRY_QUESTIONS[industryId] ?? [])];
}

/** One question of the business's set, or undefined when the key is unknown or belongs to another industry. */
export function findQuestionForIndustry(industryId: string, questionKey: string): QuestionDefinition | undefined {
  return getQuestionsForIndustry(industryId).find((question) => question.key === questionKey);
}
