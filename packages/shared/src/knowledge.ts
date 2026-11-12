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
