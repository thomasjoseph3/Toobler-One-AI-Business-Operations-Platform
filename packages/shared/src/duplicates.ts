import { z } from 'zod';
import { fieldDefinitionSchema } from './custom-fields';
import { lifecycleStageSchema } from './contacts';

// Duplicates between the API and the web app (F13): pairs of contacts, or of companies, that look like the same one, and how staff merge or dismiss them.

export const duplicateObjectSchema = z.enum(['contact', 'company']);
export type DuplicateObject = z.infer<typeof duplicateObjectSchema>;

/** Why a pair looks like the same one. The screen turns each key into words. */
export const duplicateReasonSchema = z.enum([
  'same_name_similar_phone',
  'same_name_same_email_name',
  'same_email_name_similar_phone',
  'same_name_without_suffix',
  'same_phone',
]);
export type DuplicateReason = z.infer<typeof duplicateReasonSchema>;

/** Which of the two records of a pair: `a` or `b`. */
export const pairSideSchema = z.enum(['a', 'b']);
export type PairSide = z.infer<typeof pairSideSchema>;

/**
 * One record of a pair, contact or company, with what the side-by-side screen shows. Fields that do not belong to the kind of record are null
 * (a contact has no domain, a company has no email).
 */
export const duplicateRecordSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  language: z.string().nullable(),
  lifecycleStage: lifecycleStageSchema.nullable(),
  companyId: z.string().nullable(),
  companyName: z.string().nullable(),
  domain: z.string().nullable(),
  city: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  ownerName: z.string().nullable(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  createdAt: z.string(),
});
export type DuplicateRecord = z.infer<typeof duplicateRecordSchema>;

/** One possible duplicate: the pair, why it matches, and how many leads each side has (a merge is refused when both have an open one). */
export const duplicateSuggestionSchema = z.object({
  id: z.string(),
  object: duplicateObjectSchema,
  reasons: z.array(duplicateReasonSchema),
  a: duplicateRecordSchema,
  b: duplicateRecordSchema,
  /** Whether each side has an open lead (contacts only; always false for companies). */
  aHasOpenLead: z.boolean(),
  bHasOpenLead: z.boolean(),
  createdAt: z.string(),
});
export type DuplicateSuggestion = z.infer<typeof duplicateSuggestionSchema>;

export const listDuplicatesQuerySchema = z.object({ object: duplicateObjectSchema });
export type ListDuplicatesQuery = z.infer<typeof listDuplicatesQuerySchema>;

/** `GET /duplicates`: the open pairs, with the business's live custom fields of that kind (the screen needs their labels). */
export const duplicatesListResponseSchema = z.object({
  items: z.array(duplicateSuggestionSchema),
  fields: z.array(fieldDefinitionSchema),
});
export type DuplicatesListResponse = z.infer<typeof duplicatesListResponseSchema>;

export const duplicateIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What a manager sends to merge a pair: which record to keep, and for each field the two disagree on, whose value to keep. A field left out keeps the
 * kept record's value (or the other's when the kept record has none). Fields that do not belong to the kind of record are refused (400).
 */
export const mergeDuplicateRequestSchema = z
  .object({
    keep: pairSideSchema,
    take: z
      .object({
        name: pairSideSchema.optional(),
        phone: pairSideSchema.optional(),
        email: pairSideSchema.optional(),
        language: pairSideSchema.optional(),
        lifecycleStage: pairSideSchema.optional(),
        company: pairSideSchema.optional(),
        domain: pairSideSchema.optional(),
        city: pairSideSchema.optional(),
        owner: pairSideSchema.optional(),
        custom: z.record(z.string(), pairSideSchema).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type MergeDuplicateRequest = z.infer<typeof mergeDuplicateRequestSchema>;

/** The answer to a merge: the id of the record that was kept and the id that was merged away. */
export const mergeDuplicateResponseSchema = z.object({
  object: duplicateObjectSchema,
  keptId: z.string(),
  mergedAwayId: z.string(),
});
export type MergeDuplicateResponse = z.infer<typeof mergeDuplicateResponseSchema>;

export const dismissDuplicateResponseSchema = z.object({ id: z.string(), status: z.literal('dismissed') });
export type DismissDuplicateResponse = z.infer<typeof dismissDuplicateResponseSchema>;
