import { z } from 'zod';

// The words and shapes of FAQs (short question and answer pairs the AI may use), between the API and the web app. The request
// shapes are added with the slice that builds each route.

/** Where an FAQ came from: typed by the owner, drafted from the website (F31), or made from an unanswered question. */
export const faqSourceSchema = z.enum(['typed', 'website', 'unanswered']);
export type FaqSource = z.infer<typeof faqSourceSchema>;

/** `confirmed` FAQs are used by the AI; `check` ones (drafted, not yet accepted) are never used. */
export const faqStatusSchema = z.enum(['confirmed', 'check']);
export type FaqStatus = z.infer<typeof faqStatusSchema>;

/** The longest question and answer an FAQ may have. */
export const MAX_FAQ_QUESTION_LENGTH = 300;
export const MAX_FAQ_ANSWER_LENGTH = 2000;

/** Text with the spaces tidied: no spaces at the ends, and every run of spaces or line breaks in the middle becomes one space. */
export const tidiedQuestionSchema = z
  .string()
  .transform((text) => text.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(MAX_FAQ_QUESTION_LENGTH));

/** An answer keeps its line breaks (an answer may have several lines) but loses spaces at the ends. */
export const answerTextSchema = z.string().trim().min(1).max(MAX_FAQ_ANSWER_LENGTH);

/** A question and answer, as the API shows it. */
export const faqSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  status: faqStatusSchema,
  source: faqSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Faq = z.infer<typeof faqSchema>;

/** What a manager sends to add an FAQ. A typed FAQ is the owner's own words, so it is usable at once. */
export const createFaqRequestSchema = z
  .object({
    question: tidiedQuestionSchema,
    answer: answerTextSchema,
  })
  .strict();
export type CreateFaqRequest = z.infer<typeof createFaqRequestSchema>;

/** The id in the address of /knowledge/faqs/{id}. */
export const faqIdParamsSchema = z.object({ id: z.uuid() });

/** What a person sends to change an FAQ: the question, the answer, or both. Anything else in the body is refused. */
export const updateFaqRequestSchema = z
  .object({
    question: tidiedQuestionSchema.optional(),
    answer: answerTextSchema.optional(),
  })
  .strict();
export type UpdateFaqRequest = z.infer<typeof updateFaqRequestSchema>;

/** Which FAQs to list: all of them, or only the ones waiting for a check. */
export const listFaqsQuerySchema = z
  .object({
    status: faqStatusSchema.optional(),
  })
  .strict();
export type ListFaqsQuery = z.infer<typeof listFaqsQuerySchema>;

/** The list of FAQs, newest first. */
export const faqsResponseSchema = z.object({ items: z.array(faqSchema) });
export type FaqsResponse = z.infer<typeof faqsResponseSchema>;

/** The most results one search may ask for, and how many it gives when it is not told. */
export const MAX_SEARCH_RESULTS = 10;
export const DEFAULT_SEARCH_RESULTS = 5;

/** What a person (or the AI) sends to search the knowledge base: the customer's question in their own words, and how many results. */
export const searchKnowledgeQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(MAX_FAQ_QUESTION_LENGTH),
    limit: z.coerce.number().int().min(1).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_RESULTS),
  })
  .strict();
export type SearchKnowledgeQuery = z.infer<typeof searchKnowledgeQuerySchema>;

/** One passage found by a search, with where it came from (so the AI can say "answered from FAQ ..."). */
export const searchResultSchema = z.object({
  /** What kind of source: only FAQs for now. */
  sourceKind: z.enum(['faq']),
  sourceId: z.string(),
  question: z.string(),
  answer: z.string(),
  /** How well it matches, higher is better. Only for ordering; it has no unit. */
  score: z.number(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** The passages found, best match first. */
export const searchResponseSchema = z.object({ items: z.array(searchResultSchema) });
export type SearchResponse = z.infer<typeof searchResponseSchema>;
