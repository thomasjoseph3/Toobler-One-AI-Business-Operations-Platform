import { z } from 'zod';

// The shape of what the AI settings routes answer with. The list of models lives in the database (the `ai_models` table);
// the list of jobs (tasks) lives in the API's code, and comes out of GET /api/v1/ai/models, so the web app never hard-codes either.

/** The AI companies the app can call. */
export const aiProviderSchema = z.enum(['gemini', 'openai', 'anthropic']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** A kind of job the AI does, like sorting a conversation or replying in a chat. The app asks for a job, never a model. */
export const aiTaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** What the job is, in plain English. */
  description: z.string(),
});
export type AiTask = z.infer<typeof aiTaskSchema>;

/** One model in the list. `available` is true when at least one key for its company is set up, so it can answer today. */
export const aiModelSchema = z.object({
  id: z.string(),
  provider: aiProviderSchema,
  modelName: z.string(),
  label: z.string(),
  /** The ids of the jobs this model suits. */
  tasks: z.array(z.string()),
  status: z.enum(['active', 'deprecated', 'retired']),
  /** A text model writes and reads words; a voice model talks on a live call. */
  kind: z.enum(['text', 'voice']),
  /** Small models are quick and cheap, large ones think harder. */
  size: z.enum(['small', 'medium', 'large']),
  /** True for a moving name (like gemini-flash-latest) that the provider points at newer models without notice. */
  isAlias: z.boolean(),
  /** The date the provider retires the model (typed in by the admin), or null when none is known. */
  retiresOn: z.string().nullable(),
  available: z.boolean(),
});
export type AiModel = z.infer<typeof aiModelSchema>;

/** What GET /ai/models answers with: the jobs, the models, and for each job the models that would answer it, best first. */
export const aiModelsResponseSchema = z.object({
  tasks: z.array(aiTaskSchema),
  models: z.array(aiModelSchema),
  /** For each job id: the models set for it, in order, whether or not a key exists today (the preset or the platform's setting). */
  configuredOrder: z.record(z.string(), z.array(z.string())),
  /** For each job id: the models that would really be tried today, in order (the first answers, the rest are fallbacks). */
  order: z.record(z.string(), z.array(z.string())),
});
export type AiModelsResponse = z.infer<typeof aiModelsResponseSchema>;
