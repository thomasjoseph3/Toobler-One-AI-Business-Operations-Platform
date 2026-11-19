import { z } from 'zod';
import { aiProviderSchema } from './ai';

// The log of AI calls (no message text, no key) and the health of the platform's own keys, between the API and the web app.

export const MAX_AI_CALLS_PER_PAGE = 200;

/** Which calls to list: by job, agent or channel, only the answered or only the failed ones, newest first; `before` pages back in time. */
export const aiCallsQuerySchema = z
  .object({
    task: z.string().min(1).max(60).optional(),
    agent: z.string().min(1).max(60).optional(),
    channel: z.string().min(1).max(60).optional(),
    success: z
      .enum(['true', 'false'])
      .transform((text) => text === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_AI_CALLS_PER_PAGE).default(50),
    before: z.iso.datetime().optional(),
  })
  .strict();
export type AiCallsQuery = z.infer<typeof aiCallsQuerySchema>;

/** One try of a call: which model and key position, and how it ended. Never a key. */
export const aiCallAttemptSchema = z.object({
  provider: aiProviderSchema,
  modelName: z.string(),
  keySource: z.enum(['platform', 'own']),
  keyPosition: z.number().int(),
  outcome: z.string(),
});
export type AiCallAttempt = z.infer<typeof aiCallAttemptSchema>;

/** One AI call: who asked, who answered, how it went, and what it used. */
export const aiCallSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  task: z.string(),
  agentId: z.string(),
  channel: z.string(),
  promptVersion: z.string(),
  conversationId: z.string().nullable(),
  provider: aiProviderSchema,
  modelName: z.string(),
  keySource: z.enum(['platform', 'own']),
  keyPosition: z.number().int(),
  success: z.boolean(),
  errorKind: z.string().nullable(),
  attemptCount: z.number().int(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().nullable(),
  attempts: z.array(aiCallAttemptSchema),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  latencyMs: z.number().int().nullable(),
});
export type AiCall = z.infer<typeof aiCallSchema>;

export const aiCallsResponseSchema = z.object({
  items: z.array(aiCallSchema),
  /** Pass this as `before` to get the next older page, or null when there are no more. */
  nextBefore: z.string().nullable(),
});
export type AiCallsResponse = z.infer<typeof aiCallsResponseSchema>;

/** One of the platform's own keys: its position in the server's list and what the last daily check found. Never the key. */
export const platformAiKeySchema = z.object({
  provider: aiProviderSchema,
  keyPosition: z.number().int(),
  /** `unchecked` until the daily check has looked at it. */
  status: z.enum(['unchecked', 'working', 'limited', 'failed']),
  statusNote: z.string().nullable(),
  checkedAt: z.string().nullable(),
  /** When this running copy of the API is resting the key after a limit or a rejection, otherwise null. */
  restingUntil: z.string().nullable(),
});
export type PlatformAiKey = z.infer<typeof platformAiKeySchema>;

export const platformAiKeysResponseSchema = z.object({
  items: z.array(platformAiKeySchema),
  /** How many keys each company has in the server's settings. A company with 0 is simply not available. */
  keysPerProvider: z.record(z.string(), z.number().int()),
});
export type PlatformAiKeysResponse = z.infer<typeof platformAiKeysResponseSchema>;
