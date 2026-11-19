import { z } from 'zod';
import { leadTemperatureSchema } from './leads';

// The Today page between the API and the web app (F22): the first screen staff see — "who do I call next?".
// Every section is worked out in code from leads and tasks; the AI never decides who is late or hot.

/** Whose work the page shows: the signed-in person's own, or the whole team. */
export const todayScopeSchema = z.enum(['me', 'team']);
export type TodayScope = z.infer<typeof todayScopeSchema>;

/** The query of GET /today: the scope, defaulting to the person's own. Anything else is refused. */
export const todayQuerySchema = z.object({ scope: todayScopeSchema.default('me') }).strict();
export type TodayQuery = z.infer<typeof todayQuerySchema>;

/** A person to call, with everything the card needs: who they are, their phone (for Call/WhatsApp) and what they want. */
export const todayLeadItemSchema = z.object({
  leadId: z.string(),
  contactId: z.string(),
  contactName: z.string().nullable(),
  /** E.164, for the `tel:` and WhatsApp links; null when the contact has no phone. */
  phone: z.string().nullable(),
  temperature: leadTemperatureSchema,
  /** What the person wants, in their words; null when nothing was captured. */
  interest: z.string().nullable(),
  /** Why it is on Today: a past callback, newly in, or simply hot. */
  reason: z.enum(['callback', 'new', 'hot']),
  /** The owner's name, shown only in the team view; null for the own view or a removed person. */
  ownerName: z.string().nullable(),
});
export type TodayLeadItem = z.infer<typeof todayLeadItemSchema>;

/** A task to do, with the person it is about and their phone, so staff can act straight from Today. */
export const todayTaskItemSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  kind: z.enum(['call', 'whatsapp', 'email', 'todo']),
  dueAt: z.string(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  leadId: z.string().nullable(),
  ownerName: z.string().nullable(),
});
export type TodayTaskItem = z.infer<typeof todayTaskItemSchema>;

/** The "this week" numbers, all computed in code. */
export const thisWeekSummarySchema = z.object({
  leadsIn: z.number().int(),
  leadsContacted: z.number().int(),
  leadsWon: z.number().int(),
  /** Average minutes from a lead coming in to the first staff reply this week; null when none has been replied to yet. */
  averageMinutesToFirstReply: z.number().int().nullable(),
});
export type ThisWeekSummary = z.infer<typeof thisWeekSummarySchema>;

/** The setup nudge, shown to managers only: how many go-live steps are still unfinished (null for non-managers). */
export const setupChecklistSchema = z.object({ unfinishedSteps: z.number().int() }).nullable();
export type SetupChecklist = z.infer<typeof setupChecklistSchema>;

export const todayResponseSchema = z.object({
  scope: todayScopeSchema,
  sections: z.object({
    late: z.object({ leads: z.array(todayLeadItemSchema), tasks: z.array(todayTaskItemSchema) }),
    hot: z.array(todayLeadItemSchema),
    dueToday: z.array(todayTaskItemSchema),
    overnight: z.array(todayLeadItemSchema),
    thisWeek: thisWeekSummarySchema,
  }),
  setupChecklist: setupChecklistSchema,
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
