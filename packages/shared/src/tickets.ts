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
