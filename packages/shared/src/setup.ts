import { z } from 'zod';

// The setup wizard (F31): the steps, which are done, and what still stops the business going live.

/** The steps of the setup, in the order the owner meets them. New steps are added here and in the API's list. */
export const setupStepKeySchema = z.enum([
  'website',
  'about_business',
  'what_you_sell',
  'situations',
  'goals',
  'promises',
  'pipeline',
  'team',
  'channels',
  'test_agent',
]);
export type SetupStepKey = z.infer<typeof setupStepKeySchema>;

/** "todo": not yet. "done": finished. "skipped": the owner chose to leave it for later. */
export const setupStepStatusSchema = z.enum(['todo', 'done', 'skipped']);
export type SetupStepStatus = z.infer<typeof setupStepStatusSchema>;

export const setupStepSchema = z.object({
  key: setupStepKeySchema,
  /** Which part of the wizard the step belongs to: 1 teaches the AI about the business, 2 gets it ready for customers. */
  part: z.union([z.literal(1), z.literal(2)]),
  /** True when the system works the status out from the business's answers, so the owner cannot mark it. */
  checkedBySystem: z.boolean(),
  status: setupStepStatusSchema,
});
export type SetupStep = z.infer<typeof setupStepSchema>;

/** One thing still stopping the business going live: a business question with no confirmed answer, or a setup step not finished. */
export const goLiveBlockerSchema = z.object({ kind: z.enum(['question', 'step']), key: z.string() });
export type GoLiveBlocker = z.infer<typeof goLiveBlockerSchema>;

export const setupResponseSchema = z.object({
  steps: z.array(setupStepSchema),
  /** Steps that are done, out of all steps, as a whole percent (skipped steps do not count as done). */
  percentDone: z.number().int(),
  /** The "needed to go live" questions that still have no confirmed answer. */
  neededToGoLiveStillMissing: z.array(z.string()),
  /** What still stops the business going live: those questions, then the setup steps the business must finish. */
  blockers: z.array(goLiveBlockerSchema),
  /** True when nothing stops the business going live. */
  readyToGoLive: z.boolean(),
  /** True once the business has gone live (it answers real customers). */
  isLive: z.boolean(),
  liveAt: z.string().nullable(),
});
export type SetupResponse = z.infer<typeof setupResponseSchema>;

/** What the owner sends to mark one step. A step the system checks itself answers 400 STEP_CHECKED_BY_SYSTEM. */
export const patchSetupRequestSchema = z.object({ step: setupStepKeySchema, status: setupStepStatusSchema }).strict();
export type PatchSetupRequest = z.infer<typeof patchSetupRequestSchema>;

// ---- Reading a website or Google listing to fill in answers (the prefill)

/**
 * What the owner sends to start reading. At least one of the two. The website is a web address (a bare name like lakeside.in is
 * fine). The Google listing is the business's name with its town, or a long Google Maps link.
 */
export const startPrefillRequestSchema = z
  .object({
    websiteUrl: z.string().trim().min(3).max(500).optional(),
    googleListing: z.string().trim().min(2).max(500).optional(),
  })
  .strict()
  .refine((request) => request.websiteUrl !== undefined || request.googleListing !== undefined, {
    message: 'Give a website address or a Google listing',
  });
export type StartPrefillRequest = z.infer<typeof startPrefillRequestSchema>;

export const prefillRunStatusSchema = z.enum(['queued', 'reading', 'done', 'failed']);
export type PrefillRunStatus = z.infer<typeof prefillRunStatusSchema>;

/** Something the site seems to sell, for the owner to accept (it becomes an offering) or ignore. A price is whole paise, only when the site states one. */
export const suggestedOfferingSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  fromPricePaise: z.number().int().nullable(),
});
export type SuggestedOffering = z.infer<typeof suggestedOfferingSchema>;

export const prefillRunSchema = z.object({
  id: z.uuid(),
  status: prefillRunStatusSchema,
  websiteUrl: z.string().nullable(),
  googleListing: z.string().nullable(),
  /** Set when status is `failed`: a code for the screen and a message in plain words. */
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  pagesRead: z.number().int(),
  /** The questions that now have an answer waiting for the owner's check (Yes or Change). */
  answersFound: z.array(z.string()),
  /** How many answers were left alone because the owner had already confirmed them. */
  answersSkipped: z.number().int(),
  suggestedOfferings: z.array(suggestedOfferingSchema),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type PrefillRun = z.infer<typeof prefillRunSchema>;

export const prefillRunIdParamsSchema = z.object({ id: z.uuid() });

// ---- Industry words for the pipeline, and going live

/** What applying the industry's pipeline words did: the stages renamed, and the stages left as the owner had them. */
export const applyPresetResponseSchema = z.object({
  industry: z.string(),
  renamedStages: z.array(z.object({ from: z.string(), to: z.string() })),
  leftAloneStages: z.array(z.string()),
});
export type ApplyPresetResponse = z.infer<typeof applyPresetResponseSchema>;

/** The moment the business went live. */
export const goLiveResponseSchema = z.object({ liveAt: z.string() });
export type GoLiveResponse = z.infer<typeof goLiveResponseSchema>;
