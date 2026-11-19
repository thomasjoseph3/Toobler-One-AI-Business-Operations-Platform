import { z } from 'zod';
import { answerTypeSchema, profileProgressSchema } from './knowledge';

// The setup chat (F31): the owner answers the business questions one at a time in a chat. Code picks each question; the answer is
// saved through the same checks as the form. Between the API and the web app.

/** The most skipped questions a request may list (the chat is stateless: the screen remembers what was skipped and sends it back). */
export const MAX_SKIPPED_QUESTIONS = 200;

/** The longest reply one message may hold. */
export const MAX_SETUP_REPLY_LENGTH = 2000;

/**
 * One owner message to the setup chat. Without `questionKey` it only asks for the first question to ask. With `questionKey` it
 * answers that question (`reply`) or skips it (`skip: true`). `skippedQuestionKeys` are the questions the owner skipped earlier, so
 * the chat does not ask them again.
 */
export const setupChatRequestSchema = z
  .object({
    questionKey: z.string().trim().min(1).max(100).optional(),
    reply: z.string().max(MAX_SETUP_REPLY_LENGTH).optional(),
    skip: z.boolean().optional(),
    skippedQuestionKeys: z.array(z.string().trim().min(1).max(100)).max(MAX_SKIPPED_QUESTIONS).optional(),
  })
  .strict();
export type SetupChatRequest = z.infer<typeof setupChatRequestSchema>;

/** The question the chat asks next, with what the screen needs to offer ready answers. */
export const setupChatQuestionSchema = z.object({
  key: z.string(),
  text: z.string(),
  type: answerTypeSchema,
  /** The ready options to offer (a pick question); empty for the others. */
  options: z.array(z.string()),
  /** True when the owner may also give their own words ("Other"). */
  allowOther: z.boolean(),
  /** For a "pick several": the most that may be picked, or null. */
  maxChoices: z.number().int().nullable(),
  /** For a yes or no: what to add after "Yes" (a link or some words), or null. */
  yesDetailLabel: z.string().nullable(),
  neededToGoLive: z.boolean(),
});
export type SetupChatQuestion = z.infer<typeof setupChatQuestionSchema>;

/** What the chat answers with. */
export const setupChatResponseSchema = z.object({
  /** The question the reply was saved for, or null when nothing was saved (the first call, a skip, or a reply that could not be used). */
  saved: z.object({ questionKey: z.string(), questionText: z.string() }).nullable(),
  /** Why the last reply could not be used, in plain words (the same question is asked again), or null. */
  problem: z.string().nullable(),
  /** The next question to ask, or null when nothing the chat can ask is left. */
  next: setupChatQuestionSchema.nullable(),
  /** How many unanswered questions are easier in the form (opening hours, lists, prices): the chat does not ask them. */
  formOnlyRemaining: z.number().int(),
  progress: profileProgressSchema,
});
export type SetupChatResponse = z.infer<typeof setupChatResponseSchema>;
