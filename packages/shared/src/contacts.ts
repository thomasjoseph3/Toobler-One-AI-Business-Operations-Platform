import { z } from 'zod';

// The shape of contacts between the API and the web app.

/** Where a contact stands overall. Staff can only mark or unmark `not_a_fit`; the rest are computed (leads arrive in F06). */
export const lifecycleStageSchema = z.enum(['new', 'lead', 'customer', 'repeat_customer', 'not_a_fit']);
export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;

/** An empty or blank text means "nothing was given", so a form that sends "" for an untouched field works. */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export const contactSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** International form, like +919847012345 */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  language: z.string().nullable(),
  lifecycleStage: lifecycleStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

/**
 * What staff send to add a contact. A phone or an email is needed (checked by the API, which says which). The phone may be
 * typed in any format; it is stored in international form. Anything else in the body is refused.
 */
export const createContactRequestSchema = z
  .object({
    name: z.preprocess(blankToNothing, z.string().trim().max(120).optional()),
    phone: z.preprocess(blankToNothing, z.string().trim().max(40).optional()),
    email: z.preprocess(blankToNothing, z.string().trim().toLowerCase().pipe(z.email().max(254)).optional()),
    language: z.preprocess(
      blankToNothing,
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z]{2}$/, 'Use a two-letter code like en')
        .optional(),
    ),
  })
  .strict();
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/** The list: a search box, one filter, and paging. */
export const listContactsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lifecycleStage: lifecycleStageSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export const contactsListResponseSchema = z.object({
  items: z.array(contactSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type ContactsListResponse = z.infer<typeof contactsListResponseSchema>;
