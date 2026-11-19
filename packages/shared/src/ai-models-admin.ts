import { z } from 'zod';
import { aiProviderSchema } from './ai';
import { MAX_MODELS_PER_JOB } from './ai-settings';

// What the Toobler team sees and does with the list of AI models and each job's order. Only platform admins reach these shapes.

/** A model in the list, as a platform admin sees it (the same for every business). */
export const platformAiModelSchema = z.object({
  id: z.string(),
  provider: aiProviderSchema,
  modelName: z.string(),
  label: z.string(),
  /** The ids of the jobs the model suits. */
  tasks: z.array(z.string()),
  status: z.enum(['active', 'deprecated', 'retired']),
  kind: z.enum(['text', 'voice']),
  size: z.enum(['small', 'medium', 'large']),
  isAlias: z.boolean(),
  /** The day the AI company retires it (typed in from the company's notice), or null. */
  retiresOn: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type PlatformAiModel = z.infer<typeof platformAiModelSchema>;

/** The list of models and the platform's order for each job (job id to model ids, best first). */
export const platformAiModelsResponseSchema = z.object({
  models: z.array(platformAiModelSchema),
  taskModels: z.record(z.string(), z.array(z.string())),
});
export type PlatformAiModelsResponse = z.infer<typeof platformAiModelsResponseSchema>;

/** The id in the address of /platform/ai/models/{id}. */
export const platformAiModelIdParamsSchema = z.object({ id: z.uuid() });

/** A model name as the AI company writes it: letters, digits and . _ - : / only (no spaces). */
const modelNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:/-]+$/, 'A model name has only letters, digits and . _ - : /');
const labelSchema = z
  .string()
  .transform((text) => text.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(80));
const jobIdsSchema = z.array(z.string().min(1).max(60)).max(20);
const retiresOnSchema = z.iso.date();

/** What a platform admin sends to add a model to the list. */
export const addPlatformAiModelRequestSchema = z
  .object({
    provider: aiProviderSchema,
    modelName: modelNameSchema,
    label: labelSchema,
    tasks: jobIdsSchema.default([]),
    status: z.enum(['active', 'deprecated', 'retired']).default('active'),
    kind: z.enum(['text', 'voice']).default('text'),
    size: z.enum(['small', 'medium', 'large']).default('small'),
    isAlias: z.boolean().default(false),
    retiresOn: retiresOnSchema.nullable().default(null),
    sortOrder: z.number().int().min(1).max(9999).default(100),
  })
  .strict();
export type AddPlatformAiModelRequest = z.infer<typeof addPlatformAiModelRequestSchema>;

/** What a platform admin sends to change a model: any of the fields. The company and the model name cannot change (add a new model instead). */
export const updatePlatformAiModelRequestSchema = z
  .object({
    label: labelSchema.optional(),
    tasks: jobIdsSchema.optional(),
    status: z.enum(['active', 'deprecated', 'retired']).optional(),
    kind: z.enum(['text', 'voice']).optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
    isAlias: z.boolean().optional(),
    retiresOn: retiresOnSchema.nullable().optional(),
    sortOrder: z.number().int().min(1).max(9999).optional(),
  })
  .strict();
export type UpdatePlatformAiModelRequest = z.infer<typeof updatePlatformAiModelRequestSchema>;

/** The job in the address of /platform/ai/tasks/{taskId}/models. */
export const platformAiTaskParamsSchema = z.object({ taskId: z.string().min(1).max(60) });

/** What a platform admin sends to set the order of models for a job: the ids, best first, replacing the old order. */
export const setPlatformTaskModelsRequestSchema = z
  .object({ modelIds: z.array(z.uuid()).min(1).max(MAX_MODELS_PER_JOB) })
  .strict();
export type SetPlatformTaskModelsRequest = z.infer<typeof setPlatformTaskModelsRequestSchema>;

export const platformTaskModelsSchema = z.object({ taskId: z.string(), modelIds: z.array(z.string()) });
export type PlatformTaskModels = z.infer<typeof platformTaskModelsSchema>;
