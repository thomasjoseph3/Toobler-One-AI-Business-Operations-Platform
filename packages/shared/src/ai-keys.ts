import { z } from 'zod';
import { aiProviderSchema } from './ai';

// The words and shapes of the AI keys a business saves for itself, between the API and the web app. The key itself only ever
// travels one way: in when it is added. Everything the API answers with shows just its last four characters.

/** How many keys of one AI company a business may save. More keys spread the load; this keeps the list sane. */
export const MAX_AI_KEYS_PER_PROVIDER = 10;

/** `unchecked`: never tested. `working`, `limited` (quota used up for now) and `failed` (the company rejected it) come from tests and real use. */
export const aiKeyStatusSchema = z.enum(['unchecked', 'working', 'limited', 'failed']);
export type AiKeyStatus = z.infer<typeof aiKeyStatusSchema>;

/** A saved key, as the API shows it: never the key, only a preview like "••••3f9a". */
export const aiKeySchema = z.object({
  id: z.string(),
  provider: aiProviderSchema,
  label: z.string(),
  keyPreview: z.string(),
  status: aiKeyStatusSchema,
  statusNote: z.string().nullable(),
  statusCheckedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AiKey = z.infer<typeof aiKeySchema>;

export const aiKeysResponseSchema = z.object({ items: z.array(aiKeySchema) });
export type AiKeysResponse = z.infer<typeof aiKeysResponseSchema>;

/** The id in the address of /ai/keys/{id}. */
export const aiKeyIdParamsSchema = z.object({ id: z.uuid() });

/** What a test of a key found: it works, the company rejected it, its quota is used up, it can use no model we know, or the company could not be reached. */
export const aiKeyTestOutcomeSchema = z.enum(['works', 'rejected', 'quota', 'no_model', 'unreachable']);
export type AiKeyTestOutcome = z.infer<typeof aiKeyTestOutcomeSchema>;

/** The answer to testing a key: the key as it is now, what the test found, and (when it works) which model answered and how fast. */
export const aiKeyTestResultSchema = z.object({
  key: aiKeySchema,
  outcome: aiKeyTestOutcomeSchema,
  modelName: z.string().nullable(),
  latencyMs: z.number().nullable(),
});
export type AiKeyTestResult = z.infer<typeof aiKeyTestResultSchema>;

/**
 * What a manager sends to save a key. The key is one word with no spaces; companies' keys are 20 to a few hundred characters.
 * The label is the manager's own name for it ("Main Gemini key").
 */
export const addAiKeyRequestSchema = z
  .object({
    provider: aiProviderSchema,
    label: z
      .string()
      .transform((text) => text.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(1).max(80)),
    key: z.string().trim().min(16).max(400).regex(/^\S+$/, 'A key has no spaces'),
  })
  .strict();
export type AddAiKeyRequest = z.infer<typeof addAiKeyRequestSchema>;
