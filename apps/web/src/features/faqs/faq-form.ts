import type { CreateFaqRequest, Faq, UpdateFaqRequest } from '@toobler-one/shared';
import { MAX_FAQ_ANSWER_LENGTH, MAX_FAQ_QUESTION_LENGTH } from '@toobler-one/shared';

// The form for a question and its answer (an FAQ), and how it turns into what the API takes. Pure: no screen, no network.
// The API tidies and checks everything again; these checks give quick, friendly messages.

export interface FaqFormFields {
  question: string;
  answer: string;
}

export type FaqFormProblems = Partial<Record<keyof FaqFormFields, string>>;

export const EMPTY_FAQ_FORM: FaqFormFields = { question: '', answer: '' };

export const formFromFaq = (faq: Faq): FaqFormFields => ({ question: faq.question, answer: faq.answer });

/** The question with runs of spaces and line breaks made one space, and the ends trimmed (the way the API tidies it). */
export function tidyQuestion(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Checks the form. */
export function checkFaqForm(fields: FaqFormFields): FaqFormProblems {
  const problems: FaqFormProblems = {};
  const question = tidyQuestion(fields.question);
  if (question === '') problems.question = 'Type the question a customer would ask.';
  else if (question.length > MAX_FAQ_QUESTION_LENGTH) problems.question = `Keep the question under ${MAX_FAQ_QUESTION_LENGTH} characters.`;
  const answer = fields.answer.trim();
  if (answer === '') problems.answer = 'Type the answer.';
  else if (answer.length > MAX_FAQ_ANSWER_LENGTH) problems.answer = `Keep the answer under ${MAX_FAQ_ANSWER_LENGTH} characters.`;
  return problems;
}

export const buildCreateFaqRequest = (fields: FaqFormFields): CreateFaqRequest => ({
  question: tidyQuestion(fields.question),
  answer: fields.answer.trim(),
});

/** What `PATCH /knowledge/faqs/{id}` takes: only what changed. Empty when nothing did. */
export function buildUpdateFaqRequest(original: Faq, fields: FaqFormFields): UpdateFaqRequest {
  const request: UpdateFaqRequest = {};
  if (tidyQuestion(fields.question) !== original.question) request.question = tidyQuestion(fields.question);
  if (fields.answer.trim() !== original.answer) request.answer = fields.answer.trim();
  return request;
}
