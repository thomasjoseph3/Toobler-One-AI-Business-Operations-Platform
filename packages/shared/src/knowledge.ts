import { z } from 'zod';

// The words and shapes of the business profile (the answers to the business questions) and the situations, between the
// API and the web app. The questions themselves live in the API (they are code, and the API sends them with the answers).

/** How a question is answered. Each type has its own check in the API. */
export const answerTypeSchema = z.enum([
  'short_text',
  'long_text',
  'pick_one',
  'pick_several',
  'yes_no',
  'weekly_hours',
  'list',
  'price',
  'link',
  'file',
]);
export type AnswerType = z.infer<typeof answerTypeSchema>;

/** The sections of the business questions. A to H follow the requirement; `extra` holds an industry's own questions. */
export const questionSectionSchema = z.enum(['A', 'B', 'C', 'D', 'F', 'G', 'H', 'extra']);
export type QuestionSection = z.infer<typeof questionSectionSchema>;

/** The feature that owns a question's real answer, for the questions the business profile only points to. */
export const handledElsewhereSchema = z.enum(['offerings', 'faqs', 'documents']);
export type HandledElsewhere = z.infer<typeof handledElsewhereSchema>;

/** Where an answer came from. Only `typed` exists until the website reader arrives (F31). */
export const answerSourceSchema = z.enum(['typed', 'website', 'listing', 'document']);
export type AnswerSource = z.infer<typeof answerSourceSchema>;

/** `confirmed` answers are used by the AI; `check` answers wait for a manager to accept them. */
export const answerStatusSchema = z.enum(['check', 'confirmed']);
export type AnswerStatus = z.infer<typeof answerStatusSchema>;

export const dayOfWeekSchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

/** A time of day like 09:30 (24-hour clock). */
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');

/**
 * Weekly opening hours. Either open all day, every day (`allDay`), or the days the business is open with their opening and
 * closing times (a day left out is closed). At least one day must be open, and each day must close after it opens.
 */
export const weeklyHoursValueSchema = z.union([
  z.object({ allDay: z.literal(true) }).strict(),
  z
    .object({
      days: z
        .partialRecord(
          dayOfWeekSchema,
          z
            .object({ open: clockTimeSchema, close: clockTimeSchema })
            .strict()
            .refine((hours) => hours.close > hours.open, { message: 'Closing time must be after opening time' }),
        )
        .refine((days) => Object.keys(days).length > 0, { message: 'Open on at least one day' }),
    })
    .strict(),
]);
export type WeeklyHoursValue = z.infer<typeof weeklyHoursValueSchema>;

/** The seven situations the business decides how to handle (E1 to E7 in the requirement). */
export const situationKeySchema = z.enum([
  'discount_request',
  'not_available',
  'speak_to_person',
  'complaint',
  'exact_price',
  'unknown_answer',
  'after_hours',
]);
export type SituationKey = z.infer<typeof situationKeySchema>;

/** The address part naming a business question. Its key is one of the question list's (a code), not an id. */
export const questionKeyParamsSchema = z.object({
  question_key: z
    .string()
    .max(60)
    .regex(/^[a-z][a-z0-9_]{1,59}$/, 'That is not a question key'),
});

/** A column of a "list" answer. */
export const listRowFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['text', 'long_text', 'link', 'price', 'pick']),
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
});
export type ListRowFieldInfo = z.infer<typeof listRowFieldSchema>;

/** What the business has answered to one question. */
export const questionAnswerSchema = z.object({
  /** In the shape the question's type needs (for example { choice: "Plus GST" } or { rows: [...] }). */
  value: z.json(),
  source: answerSourceSchema,
  status: answerStatusSchema,
  confirmedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;

/** One business question, with its answer if there is one. */
export const knowledgeQuestionSchema = z.object({
  key: z.string(),
  section: questionSectionSchema,
  text: z.string(),
  type: answerTypeSchema,
  /** The ready options of a pick question; null for the other types. */
  options: z.array(z.string()).nullable(),
  /** True when "Other" with the person's own words is allowed. */
  allowOther: z.boolean(),
  maxChoices: z.number().int().nullable(),
  /** For a yes or no: the link or words that go with "Yes"; null when there are none. */
  yesDetail: z.object({ kind: z.enum(['link', 'text']), required: z.boolean(), label: z.string() }).nullable(),
  /** For a list: its columns and the most rows; null for the other types. */
  rowFields: z.array(listRowFieldSchema).nullable(),
  maxRows: z.number().int().nullable(),
  neededToGoLive: z.boolean(),
  /** Set when the real answer lives in another feature: the question is shown but cannot be answered here. */
  handledElsewhere: handledElsewhereSchema.nullable(),
  /** What the answer is used for, when more than the AI's knowledge; null otherwise. */
  usedFor: z.string().nullable(),
  /** Null until the question is answered. */
  answer: questionAnswerSchema.nullable(),
});
export type KnowledgeQuestion = z.infer<typeof knowledgeQuestionSchema>;

/** How complete the business profile is, and whether the business has answered everything needed to go live. */
export const profileProgressSchema = z.object({
  /** How many questions count (the ones answered in the profile, not in offerings, FAQs or documents). */
  totalQuestions: z.number().int(),
  /** How many of them have a confirmed answer. */
  answeredQuestions: z.number().int(),
  /** How many have an answer waiting for a manager to confirm it. */
  waitingForCheck: z.number().int(),
  percentComplete: z.number().int(),
  /** Question keys with no confirmed answer, the "needed to go live" ones first. */
  stillToAnswer: z.array(z.string()),
  readyToGoLive: z.boolean(),
  neededToGoLiveStillMissing: z.array(z.string()),
});
export type ProfileProgress = z.infer<typeof profileProgressSchema>;

export const knowledgeQuestionsResponseSchema = z.object({
  questions: z.array(knowledgeQuestionSchema),
  progress: profileProgressSchema,
});
export type KnowledgeQuestionsResponse = z.infer<typeof knowledgeQuestionsResponseSchema>;

/**
 * What a manager sends to answer or change one question: the answer's value, in the shape the question's type needs. The
 * API checks it against the question. An answer a manager types is confirmed straight away.
 */
export const putAnswerRequestSchema = z.object({ value: z.json() }).strict();
export type PutAnswerRequest = z.infer<typeof putAnswerRequestSchema>;

/** What answering a question gives back: the question with its new answer, and the new progress. */
export const putAnswerResponseSchema = z.object({
  question: knowledgeQuestionSchema,
  progress: profileProgressSchema,
});
export type PutAnswerResponse = z.infer<typeof putAnswerResponseSchema>;
