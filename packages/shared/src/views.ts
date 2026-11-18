import { z } from 'zod';

// Saved views between the API and the web app (F11): a person filters and sorts a list, names the result ("My hot leads") and finds it again as a tab.

/** The lists that can have saved views. Only Leads so far; the other lists join when the filter engine arrives. */
export const viewObjectSchema = z.enum(['lead']);
export type ViewObject = z.infer<typeof viewObjectSchema>;

/** The most views one person can save for one list. */
export const MAX_VIEWS_PER_PERSON = 30;

/**
 * What a Leads view filters on, in the list's own words: `status` (open or closed leads), `stageId` (one stage) and `owner` ("me" = the leads of whoever
 * is looking, so a shared view means "my leads" to each person). Anything else is refused. A filter that is left out does not narrow anything.
 */
export const leadViewFiltersSchema = z
  .object({
    status: z.enum(['open', 'closed']).optional(),
    stageId: z.uuid().optional(),
    owner: z.literal('me').optional(),
  })
  .strict();
export type LeadViewFilters = z.infer<typeof leadViewFiltersSchema>;

/** The sort fields the Leads list knows. */
export const leadViewSortFieldSchema = z.enum(['lastActivity', 'createdAt', 'callbackAt', 'stage']);

/** One saved view, as the API answers. */
export const savedViewSchema = z.object({
  id: z.string(),
  object: viewObjectSchema,
  name: z.string(),
  filters: leadViewFiltersSchema,
  sort: z.object({ field: leadViewSortFieldSchema, order: z.enum(['asc', 'desc']) }).nullable(),
  layout: z.enum(['list', 'pipeline']),
  /** Shared with the whole team by a manager. */
  shared: z.boolean(),
  /** True when the person asking saved it (a shared view of a colleague is not theirs). */
  isMine: z.boolean(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

/** `GET /views?object=`: the object is required, because every list has its own views. */
export const listViewsQuerySchema = z.object({ object: viewObjectSchema });
export type ListViewsQuery = z.infer<typeof listViewsQuerySchema>;

export const viewsListResponseSchema = z.object({ items: z.array(savedViewSchema) });
export type ViewsListResponse = z.infer<typeof viewsListResponseSchema>;

/** What a person sends to save the list as it is on screen. The name is trimmed; the owner, the business and "shared" are never taken from the request. */
export const createViewRequestSchema = z
  .object({
    object: viewObjectSchema,
    name: z.string().trim().min(1).max(60),
    filters: leadViewFiltersSchema.default({}),
    sort: z
      .object({ field: leadViewSortFieldSchema, order: z.enum(['asc', 'desc']) })
      .nullable()
      .default(null),
    layout: z.enum(['list', 'pipeline']).default('list'),
  })
  .strict();
export type CreateViewRequest = z.infer<typeof createViewRequestSchema>;

/** The address part naming a view. */
export const viewIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What a person sends to change a view: its name, whether it is shared with the team (managers only), or what it filters, sorts and shows. Only what is
 * sent changes. The list, the owner and the business are never changed.
 */
export const updateViewRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    shared: z.boolean().optional(),
    filters: leadViewFiltersSchema.optional(),
    sort: z
      .object({ field: leadViewSortFieldSchema, order: z.enum(['asc', 'desc']) })
      .nullable()
      .optional(),
    layout: z.enum(['list', 'pipeline']).optional(),
  })
  .strict();
export type UpdateViewRequest = z.infer<typeof updateViewRequestSchema>;
