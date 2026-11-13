import { z } from 'zod';
import { aiProviderSchema } from './ai';

// What the AI used, between the API and the web app: calls, failures, fallbacks and tokens, and what is running right now.

/** How the totals are split. Left out, the answer is one total. */
export const aiUsageGroupBySchema = z.enum(['task', 'agent', 'channel', 'model', 'day']);
export type AiUsageGroupBy = z.infer<typeof aiUsageGroupBySchema>;

/** The longest stretch of days one usage question may cover. */
export const MAX_USAGE_DAYS = 366;

const dayTextSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a day like 2026-11-13');

/** The question: from and to are days (UTC, both included). Left out, the range is this month so far. */
export const aiUsageQuerySchema = z
  .object({
    from: dayTextSchema.optional(),
    to: dayTextSchema.optional(),
    groupBy: aiUsageGroupBySchema.optional(),
  })
  .strict();
export type AiUsageQuery = z.infer<typeof aiUsageQuerySchema>;

/** The numbers for a set of calls. `cacheHitRate` is the share of input tokens the provider served from its cache (0 to 1). */
export const aiUsageNumbersSchema = z.object({
  calls: z.number().int(),
  failures: z.number().int(),
  fallbacks: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  cacheHitRate: z.number(),
});
export type AiUsageNumbers = z.infer<typeof aiUsageNumbersSchema>;

export const aiUsageGroupSchema = aiUsageNumbersSchema.extend({ key: z.string() });
export type AiUsageGroup = z.infer<typeof aiUsageGroupSchema>;

/** What the business has used of the platform's keys this month, against what the platform allowed. */
export const aiPlatformUsageSchema = z.object({
  enabled: z.boolean(),
  monthlyCallCap: z.number().int().nullable(),
  usedThisMonth: z.number().int(),
  /** Calls left this month, or null when there is no cap. */
  remainingThisMonth: z.number().int().nullable(),
  expiresAt: z.string().nullable(),
});
export type AiPlatformUsage = z.infer<typeof aiPlatformUsageSchema>;

export const aiUsageResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  groupBy: aiUsageGroupBySchema.nullable(),
  totals: aiUsageNumbersSchema,
  groups: z.array(aiUsageGroupSchema),
  platform: aiPlatformUsageSchema,
});
export type AiUsageResponse = z.infer<typeof aiUsageResponseSchema>;

/** What answered a job last. */
export const aiLastAnswerSchema = z.object({
  provider: aiProviderSchema,
  modelName: z.string(),
  keySource: z.enum(['platform', 'own']),
  at: z.string(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().nullable(),
});
export type AiLastAnswer = z.infer<typeof aiLastAnswerSchema>;

/** One job's state: the model expected first, what really answered last, and whether it is running on a fallback. */
export const aiTaskStatusSchema = z.object({
  taskId: z.string(),
  label: z.string(),
  /** The first model that would be tried for this business today, or null when nothing can answer. */
  expectedModelName: z.string().nullable(),
  lastAnswer: aiLastAnswerSchema.nullable(),
  /** True when the last answer (within the hour) came from a fallback or from a different model than expected. */
  runningOnFallback: z.boolean(),
});
export type AiTaskStatus = z.infer<typeof aiTaskStatusSchema>;

/** A key set aside for a while after a limit or a rejection (this running copy of the API; it comes back by itself). */
export const aiRestingKeySchema = z.object({
  keySource: z.enum(['platform', 'own']),
  provider: aiProviderSchema,
  /** The business's own key id and label, or null for the platform's. */
  keyId: z.string().nullable(),
  keyLabel: z.string().nullable(),
  keyPosition: z.number().int(),
  /** The model it rests for, or `*` when the company rejected the key for every model. */
  modelName: z.string(),
  until: z.string(),
});
export type AiRestingKey = z.infer<typeof aiRestingKeySchema>;

export const aiStatusResponseSchema = z.object({
  tasks: z.array(aiTaskStatusSchema),
  restingKeys: z.array(aiRestingKeySchema),
});
export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;
