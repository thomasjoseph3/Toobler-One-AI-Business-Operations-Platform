import { z } from 'zod';
import { answerTextSchema, tidiedQuestionSchema } from './faqs';

// The words and shapes of unanswered questions (what customers asked that the AI could not answer), between the API and the web app.

/** Open: nobody has dealt with it. Answered: an FAQ was made from it. Ignored: the team chose to leave it. */
export const unansweredQuestionStatusSchema = z.enum(['open', 'answered', 'ignored']);
export type UnansweredQuestionStatus = z.infer<typeof unansweredQuestionStatusSchema>;

/** The longest question that is kept. */
export const MAX_UNANSWERED_QUESTION_LENGTH = 300;

/** An unanswered question, as the API shows it. */
export const unansweredQuestionSchema = z.object({
  id: z.string(),
  /** The question as first asked, with emails and phone numbers blanked out. */
  question: z.string(),
  /** How many times customers asked it. */
  count: z.number().int(),
  lastAskedAt: z.string(),
  status: unansweredQuestionStatusSchema,
  /** The FAQ made from this question; null unless it is answered. */
  faqId: z.string().nullable(),
  createdAt: z.string(),
});
export type UnansweredQuestion = z.infer<typeof unansweredQuestionSchema>;

/** Which questions to list: the open ones (default), or all of them with the answered and ignored ones as history. */
export const listUnansweredQuestionsQuerySchema = z
  .object({
    include: z.enum(['history']).optional(),
  })
  .strict();
export type ListUnansweredQuestionsQuery = z.infer<typeof listUnansweredQuestionsQuerySchema>;

/** The list of unanswered questions, most asked first. */
export const unansweredQuestionsResponseSchema = z.object({ items: z.array(unansweredQuestionSchema) });
export type UnansweredQuestionsResponse = z.infer<typeof unansweredQuestionsResponseSchema>;

/** The id in the address of /knowledge/unanswered/{id}/answer and /dismiss. */
export const unansweredQuestionIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What a person sends to answer an unanswered question: the answer, and optionally a better wording of the question (customers' own
 * words may be rough). The question and answer become a new FAQ. Anything else in the body is refused.
 */
export const answerUnansweredQuestionRequestSchema = z
  .object({
    answer: answerTextSchema,
    question: tidiedQuestionSchema.optional(),
  })
  .strict();
export type AnswerUnansweredQuestionRequest = z.infer<typeof answerUnansweredQuestionRequestSchema>;
