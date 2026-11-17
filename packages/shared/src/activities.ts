import { z } from 'zod';

// The activity timeline between the API and the web app. Slice 1 has one kind: notes on a lead (or on a contact).

/** What kind of thing happened. Only notes exist so far; stage changes, calls, chats and so on join later. */
export const activityKindSchema = z.enum(['note']);
export type ActivityKind = z.infer<typeof activityKindSchema>;

/** The longest note the API accepts. */
export const MAX_NOTE_LENGTH = 2000;

/** Who wrote an activity: a person (with the name and role the business knows them by), an agent such as the AI, or the system. */
export const activityWriterSchema = z.object({
  kind: z.enum(['user', 'agent', 'system']),
  userId: z.string().nullable(),
  /** The person's name, or the agent's name; null when the person was removed. */
  name: z.string().nullable(),
  /** The person's role in the business; null for an agent or the system. */
  role: z.enum(['manager', 'staff', 'staff_own']).nullable(),
});
export type ActivityWriter = z.infer<typeof activityWriterSchema>;

export const activitySchema = z.object({
  id: z.string(),
  kind: activityKindSchema,
  contactId: z.string(),
  /** Null for a note written on a contact itself. */
  leadId: z.string().nullable(),
  /** The note's words. */
  body: z.string().nullable(),
  writtenBy: activityWriterSchema,
  createdAt: z.string(),
  /** When the writer last changed the words; null if never. */
  editedAt: z.string().nullable(),
});
export type Activity = z.infer<typeof activitySchema>;

/**
 * What staff send to add a note: the words and exactly one of `leadId` (a note on a lead) or `contactId` (a note on a person). The
 * writer, the business and the time are never taken from the request. Anything else in the body is refused.
 */
export const createNoteRequestSchema = z
  .object({
    leadId: z.uuid().optional(),
    contactId: z.uuid().optional(),
    body: z.string().trim().min(1, 'Write the note first').max(MAX_NOTE_LENGTH, 'That note is too long'),
  })
  .strict()
  .refine((request) => (request.leadId === undefined) !== (request.contactId === undefined), {
    message: 'Send exactly one of leadId or contactId',
    path: ['leadId'],
  });
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

/**
 * The timeline of one lead (`lead_id`) or of one person (`contact_id`: every lead of theirs too), newest first. One of the two is
 * needed. `kind` narrows it to one kind.
 */
export const listActivitiesQuerySchema = z.object({
  lead_id: z.uuid().optional(),
  contact_id: z.uuid().optional(),
  kind: activityKindSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export const activitiesListResponseSchema = z.object({
  items: z.array(activitySchema),
  /** How many activities match in all, not just on this page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type ActivitiesListResponse = z.infer<typeof activitiesListResponseSchema>;

/** The address part naming a note. */
export const noteIdParamsSchema = z.object({ id: z.uuid() });

/** What the writer sends to change a note: the new words. Anything else in the body is refused (the writer, the lead and the time never change). */
export const updateNoteRequestSchema = z
  .object({
    body: z.string().trim().min(1, 'Write the note first').max(MAX_NOTE_LENGTH, 'That note is too long'),
  })
  .strict();
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;

/** The most leads one count request may ask about (a page of the list is 25). */
export const MAX_LEADS_PER_COUNT_REQUEST = 100;

/** The leads to count notes for: their ids, separated by commas (`lead_ids=a,b,c`). */
export const noteCountsQuerySchema = z.object({
  lead_ids: z
    .string()
    .transform((text) => text.split(',').filter((id) => id.trim() !== ''))
    .pipe(z.array(z.uuid()).min(1).max(MAX_LEADS_PER_COUNT_REQUEST)),
});
export type NoteCountsQuery = z.infer<typeof noteCountsQuerySchema>;

/** How many notes each asked-about lead has (0 when none, and for a lead the person cannot see). Deleted notes are not counted. */
export const noteCountsResponseSchema = z.object({ counts: z.record(z.string(), z.number().int()) });
export type NoteCountsResponse = z.infer<typeof noteCountsResponseSchema>;
