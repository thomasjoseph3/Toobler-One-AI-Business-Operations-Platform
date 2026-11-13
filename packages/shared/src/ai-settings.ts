import { z } from 'zod';

// A business's AI settings, between the API and the web app. The manager chooses the key mode and its own models for jobs; the
// platform's part (whether platform keys may be used, the cap and end date) is shown read-only here and changed by the platform team.

/** Where the business's AI keys come from. */
export const aiKeyModeSchema = z.enum(['own', 'platform', 'own_then_platform']);
export type AiKeyMode = z.infer<typeof aiKeyModeSchema>;

/** The business's own model order for the jobs it overrides: job id to model ids, best first. Jobs not listed use the platform's setting. */
export const MAX_MODELS_PER_JOB = 8;
export const taskModelsSchema = z.record(z.string().min(1).max(60), z.array(z.uuid()).min(1).max(MAX_MODELS_PER_JOB));
export type TaskModels = z.infer<typeof taskModelsSchema>;

/** What the platform has allowed this business, shown to the manager (read-only). */
export const aiPlatformAccessSchema = z.object({
  enabled: z.boolean(),
  /** Calls a month the business may make on the platform's keys, or null for no cap. */
  monthlyCallCap: z.number().int().nullable(),
  /** When platform access ends, or null for no end date. */
  expiresAt: z.string().nullable(),
});
export type AiPlatformAccess = z.infer<typeof aiPlatformAccessSchema>;

export const aiSettingsSchema = z.object({
  keyMode: aiKeyModeSchema,
  taskModels: taskModelsSchema,
  platformAccess: aiPlatformAccessSchema,
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

/** What a manager sends to change the settings: either or both. `taskModels` replaces the whole set of overrides ({} clears them). */
export const updateAiSettingsRequestSchema = z
  .object({
    keyMode: aiKeyModeSchema.optional(),
    taskModels: taskModelsSchema.optional(),
  })
  .strict();
export type UpdateAiSettingsRequest = z.infer<typeof updateAiSettingsRequestSchema>;
