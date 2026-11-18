import { z } from 'zod';

// Static contact lists between the API and the web app (F11): a fixed group of contacts ("Diwali offer 2026"), saved from a contacts view or built by hand.

/** The most contacts one list can hold. */
export const MAX_LIST_MEMBERS = 5000;
/** The most contacts one request can add by id. */
export const MAX_CONTACT_IDS_PER_REQUEST = 500;

/** One list, as the API answers. */
export const contactListSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** How many live contacts are in it (a deleted contact is not counted). */
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type ContactList = z.infer<typeof contactListSchema>;

export const contactListsResponseSchema = z.object({ items: z.array(contactListSchema) });
export type ContactListsResponse = z.infer<typeof contactListsResponseSchema>;

/** The contacts view a list is made from: the same words the contacts list uses (search text, lifecycle stage and the filter engine's `filters`). */
export const listSourceViewSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    lifecycleStage: z.enum(['new', 'lead', 'customer', 'repeat_customer', 'not_a_fit']).optional(),
    filters: z.string().max(4000).optional(),
  })
  .strict();
export type ListSourceView = z.infer<typeof listSourceViewSchema>;

/**
 * What a person sends to make a list: a name, and either the contacts to put in it (`contactIds`), or a contacts view (`fromView`: every contact that matches it
 * right now goes in, once), or neither (an empty list to fill later). Not both. The business and who made it come from the session.
 */
export const createListRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    contactIds: z.array(z.uuid()).max(MAX_CONTACT_IDS_PER_REQUEST).optional(),
    fromView: listSourceViewSchema.optional(),
  })
  .strict()
  .refine((request) => request.contactIds === undefined || request.fromView === undefined, {
    message: 'Send the contacts or a view, not both',
    path: ['fromView'],
  });
export type CreateListRequest = z.infer<typeof createListRequestSchema>;
