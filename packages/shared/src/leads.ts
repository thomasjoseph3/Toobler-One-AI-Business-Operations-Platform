import { z } from 'zod';
import { stageKindSchema } from './pipeline';

// The shape of leads between the API and the web app.

/** An empty or blank text means "nothing was given", so a form that sends "" for an untouched field works. */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** True for a date like 2026-12-20 that really exists (not 2026-02-31). Never throws, whatever text it is given. */
function isRealCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A calendar date written like 2026-12-20, and a real one (not 2026-02-31). */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-20')
  .refine((value) => isRealCalendarDate(value), 'That date does not exist');

export const leadTemperatureSchema = z.enum(['unscored', 'hot', 'warm', 'cold']);
export type LeadTemperature = z.infer<typeof leadTemperatureSchema>;

/** How the enquiry first reached the business. Leads added by staff by hand are `manual`. */
export const leadChannelSchema = z.enum(['manual', 'web_chat', 'whatsapp', 'email', 'phone']);
export type LeadChannel = z.infer<typeof leadChannelSchema>;

/** The few facts about the person that a card or a row needs. */
export const leadContactSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type LeadContact = z.infer<typeof leadContactSchema>;

export const leadSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  /** Null when the contact was deleted. */
  contact: leadContactSchema.nullable(),
  stage: z.object({ id: z.string(), name: z.string(), kind: stageKindSchema }),
  temperature: leadTemperatureSchema,
  /** What the person wants, in their words. */
  interest: z.string().nullable(),
  /** Plain dates like 2026-12-20. */
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  partySize: z.number().int().nullable(),
  /** Money in paise (whole numbers), never rupees with decimals. */
  budgetPaise: z.number().int().nullable(),
  promise: z.string().nullable(),
  callbackAt: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  /** The offering the lead is about, with its name (kept even if the offering was removed later); null when it names none. */
  offering: z.object({ id: z.string(), name: z.string() }).nullable(),
  firstChannel: leadChannelSchema,
  lastActivityAt: z.string(),
  lostReason: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;

/**
 * What staff send to add a lead by hand. Only the contact is needed. The lead starts in the first stage, its channel is
 * `manual`, and, when no owner is named, the owner comes from the business's sharing-out rule. Anything else in the body is
 * refused (the stage, the business and the temperature are never taken from the request).
 */
export const createLeadRequestSchema = z
  .object({
    contactId: z.uuid(),
    interest: z.preprocess(blankToNothing, z.string().trim().max(1000).optional()),
    dateFrom: z.preprocess(blankToNothing, calendarDateSchema.optional()),
    dateTo: z.preprocess(blankToNothing, calendarDateSchema.optional()),
    partySize: z.number().int().min(1).max(10_000).optional(),
    budgetPaise: z.number().int().min(0).max(1_000_000_000_000).optional(),
    promise: z.preprocess(blankToNothing, z.string().trim().max(500).optional()),
    callbackAt: z.preprocess(blankToNothing, z.iso.datetime({ offset: true }).optional()),
    ownerUserId: z.uuid().optional(),
    offeringId: z.uuid().optional(),
  })
  .strict()
  .refine((lead) => !lead.dateFrom || !lead.dateTo || lead.dateTo >= lead.dateFrom, {
    message: 'The end date cannot be before the start date',
    path: ['dateTo'],
  });
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

/** The list or the board, with filters. The board shows every stage and ignores `stageId`, `status`, `page` and `limit`. */
export const listLeadsQuerySchema = z.object({
  view: z.enum(['list', 'board']).default('list'),
  stageId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  offeringId: z.uuid().optional(),
  /** `open` = still in progress; `closed` = won or lost. */
  status: z.enum(['open', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const leadsListResponseSchema = z.object({
  view: z.literal('list'),
  items: z.array(leadSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type LeadsListResponse = z.infer<typeof leadsListResponseSchema>;

/** One column of the board: a stage and its newest leads (the column's `leadCount` is the full number). */
export const boardColumnSchema = z.object({
  stage: z.object({ id: z.string(), name: z.string(), kind: stageKindSchema, sort: z.number().int() }),
  leadCount: z.number().int(),
  leads: z.array(leadSchema),
  /** True when the column holds more leads than were sent. */
  hasMore: z.boolean(),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const leadsBoardResponseSchema = z.object({ view: z.literal('board'), columns: z.array(boardColumnSchema) });
export type LeadsBoardResponse = z.infer<typeof leadsBoardResponseSchema>;

export const leadsResponseSchema = z.discriminatedUnion('view', [leadsListResponseSchema, leadsBoardResponseSchema]);
export type LeadsResponse = z.infer<typeof leadsResponseSchema>;

/** The address part naming a lead. */
export const leadIdParamsSchema = z.object({ id: z.uuid() });

/** For an edit: a blank text, like an emptied form field, means "clear it". Leaving the key out means "leave it as it is". */
const clearIfBlank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/**
 * What staff send to change a lead's details. Only the fields sent change; `null` (or blank text) clears a field. The stage,
 * the owner and the temperature have their own routes or features, so they are refused here, and so is anything else. The
 * end date may not be before the start date (checked by the API against what the lead holds).
 */
export const updateLeadRequestSchema = z
  .object({
    interest: z.preprocess(clearIfBlank, z.string().trim().max(1000).nullable().optional()),
    dateFrom: z.preprocess(clearIfBlank, calendarDateSchema.nullable().optional()),
    dateTo: z.preprocess(clearIfBlank, calendarDateSchema.nullable().optional()),
    partySize: z.number().int().min(1).max(10_000).nullable().optional(),
    budgetPaise: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
    promise: z.preprocess(clearIfBlank, z.string().trim().max(500).nullable().optional()),
    callbackAt: z.preprocess(clearIfBlank, z.iso.datetime({ offset: true }).nullable().optional()),
    /** The offering the lead is about; null takes it away. Changing it does not hand the lead to someone else. */
    offeringId: z.uuid().nullable().optional(),
  })
  .strict();
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;

/**
 * What staff send to move a lead to another stage. Moving to the Lost stage needs `lostReason`, one of the business's lost
 * reasons (GET /lost-reasons); sending one to any other stage is refused. Moving a closed lead (Won or Lost) back to an
 * open stage reopens it.
 */
export const moveLeadRequestSchema = z
  .object({
    stageId: z.uuid(),
    lostReason: z.preprocess(blankToNothing, z.string().trim().max(80).optional()),
  })
  .strict();
export type MoveLeadRequest = z.infer<typeof moveLeadRequestSchema>;

/** What staff send to change a lead's owner. `null` leaves the lead with nobody. The person must work for the business. */
export const assignLeadRequestSchema = z.object({ ownerUserId: z.uuid().nullable() }).strict();
export type AssignLeadRequest = z.infer<typeof assignLeadRequestSchema>;
