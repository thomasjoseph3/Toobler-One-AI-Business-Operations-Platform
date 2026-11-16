import { z } from 'zod';

// The shape of the block list between the API and the web app: phone numbers and email addresses a manager never wants treated
// as a customer (docs/CONVERSATION-TYPES.md). Whoever contacts the business from one is sorted as spam before any AI is asked.

/** The most entries one business may keep (a guard against runaway requests). */
export const MAX_BLOCK_LIST_ENTRIES = 500;

/** One blocked number or email as the API shows it. Exactly one of `phone` and `email` is set. */
export const blockListEntrySchema = z.object({
  id: z.string(),
  /** The number in international form with the plus, like +919847012345. */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type BlockListEntry = z.infer<typeof blockListEntrySchema>;

export const blockListResponseSchema = z.object({ items: z.array(blockListEntrySchema) });
export type BlockListResponse = z.infer<typeof blockListResponseSchema>;

/** A blank text means "nothing was given". */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/**
 * What a manager sends for one entry: a phone number (any way it is written) or an email, and an optional reason. Exactly one of
 * phone and email. A number typed without a country code is read as a number of the business's country.
 */
export const blockListRequestEntrySchema = z
  .object({
    phone: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
    reason: z.preprocess(blankToNothing, z.string().trim().max(200).nullable().optional()),
  })
  .strict()
  .refine((entry) => (entry.phone === undefined) !== (entry.email === undefined), {
    message: 'Give either a phone number or an email address for each entry, not both and not neither.',
  });

/** The whole list, as it should be after saving. Entries not listed are removed; an empty list clears it. */
export const replaceBlockListRequestSchema = z
  .object({ items: z.array(blockListRequestEntrySchema).max(MAX_BLOCK_LIST_ENTRIES) })
  .strict();
export type ReplaceBlockListRequest = z.infer<typeof replaceBlockListRequestSchema>;
