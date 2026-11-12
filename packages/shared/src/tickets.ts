import { z } from 'zod';

// The shape of tickets between the API and the web app. (Slice 0: the words and the shape of one ticket; the request
// shapes are added with the slice that builds each route.)

/** What the ticket is about. The router (F15) will set this; staff pick it when adding one by hand. */
export const ticketTypeSchema = z.enum(['callback', 'question', 'complaint', 'existing_customer', 'other']);
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

/** Open means someone still has to act; done means it was closed. */
export const ticketStatusSchema = z.enum(['open', 'done']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

/** One note on a ticket: who wrote it and when. */
export const ticketNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  /** The person who wrote it (null if that person was removed or it was written by the system). */
  writtenByUserId: z.string().nullable(),
  createdAt: z.string(),
});
export type TicketNote = z.infer<typeof ticketNoteSchema>;

/** The address part naming a ticket. */
export const ticketIdParamsSchema = z.object({ id: z.uuid() });

/** An empty or blank text means "nothing was given", so a form that sends "" for an untouched field works. */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** The few facts about the person that a ticket row or page needs. */
export const ticketContactSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type TicketContact = z.infer<typeof ticketContactSchema>;

export const ticketSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  /** Null when the contact was deleted. */
  contact: ticketContactSchema.nullable(),
  /** A short line saying what the ticket is about. */
  title: z.string(),
  details: z.string().nullable(),
  type: ticketTypeSchema,
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  /** Null while nobody owns the ticket. */
  ownerUserId: z.string().nullable(),
  /** Which conversation type raised it (set by the router later); null for tickets added by hand. */
  conversationTypeKey: z.string().nullable(),
  closedAt: z.string().nullable(),
  /** The person who closed it (null while open, or if it was closed by the system). */
  closedByUserId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Ticket = z.infer<typeof ticketSchema>;

/** One ticket with its notes, oldest first. */
export const ticketDetailSchema = ticketSchema.extend({ notes: z.array(ticketNoteSchema) });
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

/**
 * What staff send to add a ticket by hand. Only the contact and a title are needed. The ticket starts open; the type is
 * `other` and the priority `normal` unless sent; it has no owner unless one is named. Anything else in the body is refused
 * (the status, the business and who created it are never taken from the request).
 */
export const createTicketRequestSchema = z
  .object({
    contactId: z.uuid(),
    title: z.string().trim().min(1, 'Say what the ticket is about').max(200),
    details: z.preprocess(blankToNothing, z.string().trim().max(2000).optional()),
    type: ticketTypeSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    ownerUserId: z.uuid().optional(),
  })
  .strict();
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

/**
 * The list, with filters. `ownerUserId` is a person's id, `me` (the signed-in person) or `unassigned` (nobody owns it).
 * Newest tickets first.
 */
export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  ownerUserId: z.union([z.uuid(), z.enum(['me', 'unassigned'])]).optional(),
  type: ticketTypeSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  contactId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const ticketsListResponseSchema = z.object({
  items: z.array(ticketSchema),
  /** How many tickets match the filters in all, not just on this page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type TicketsListResponse = z.infer<typeof ticketsListResponseSchema>;
