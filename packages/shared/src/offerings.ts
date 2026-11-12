import { z } from 'zod';
import { calendarDateSchema } from './leads';

// The words and shapes of offerings (what the business sells) and offers (time-limited promotions), between the API and the
// web app. The request shapes are added with the slice that builds each route.

/** Whether the "from" price includes GST, is plus GST, or the item carries no GST. */
export const gstModeSchema = z.enum(['included', 'plus', 'none']);
export type GstMode = z.infer<typeof gstModeSchema>;

/** The units the screen offers for a price. Any short words are allowed, so a business can write "per trip". */
export const COMMON_PRICE_UNITS = [
  'per night',
  'per person',
  'per package',
  'per visit',
  'per hour',
  'per item',
] as const;

/** One extra detail of an offering, such as "Check-in" and "2 PM". */
export const offeringDetailSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    value: z.string().trim().min(1).max(200),
  })
  .strict();
export type OfferingDetail = z.infer<typeof offeringDetailSchema>;

/** The most extra details one offering may have. */
export const MAX_OFFERING_DETAILS = 10;

/** Something the business sells, as the API shows it. */
export const offeringSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Money in paise (whole numbers), never rupees with decimals. Null when the business does not share a price. */
  fromPricePaise: z.number().int().nullable(),
  /** In words, for example "per night". Null exactly when there is no price. */
  priceUnit: z.string().nullable(),
  /** Null exactly when there is no price. */
  gstMode: gstModeSchema.nullable(),
  /** The price in words as the AI would say it, for example "from ₹4,500 a night plus GST". Null when there is no price. */
  priceInWords: z.string().nullable(),
  seasonNote: z.string().nullable(),
  includes: z.string().nullable(),
  details: z.array(offeringDetailSchema),
  /** Off means the AI never mentions it. */
  active: z.boolean(),
  /** Position in the list, starting at 0. */
  sort: z.number().int(),
  /** The person who looks after this offering (new leads about it can go to them); null when nobody does. */
  ownerUserId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Offering = z.infer<typeof offeringSchema>;

/** A time-limited promotion, as the API shows it. */
export const offerSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** The last day the offer is on, a plain date like 2026-12-31. It counts through the end of that day in the business's time zone. */
  endsOn: z.string(),
  /** True while today (in the business's time zone) is on or before `endsOn`. */
  current: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Offer = z.infer<typeof offerSchema>;

/** An empty or blank text means "nothing was given", so a form that sends "" for an untouched field works. */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** The most offerings one business may have (a guard against runaway imports; far more than a small business needs). */
export const MAX_OFFERINGS = 200;

/** The address part naming an offering. */
export const offeringIdParamsSchema = z.object({ id: z.uuid() });

/** The highest "from" price accepted, in paise (1,000 crore rupees). */
const MAX_PRICE_PAISE = 100_000_000_000;

/**
 * What a manager sends to add an offering. Only the name is needed. A price comes with its unit and its GST note, or none of the three
 * (the business does not share a price). The offering goes to the end of the list and starts switched on. Anything else in the body is
 * refused (the position, the business and who created it are never taken from the request).
 */
export const createOfferingRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the offering a name').max(120),
    description: z.preprocess(blankToNothing, z.string().trim().max(1000).optional()),
    fromPricePaise: z.number().int('Use whole paise').min(0).max(MAX_PRICE_PAISE).optional(),
    priceUnit: z.preprocess(blankToNothing, z.string().trim().min(1).max(40).optional()),
    gstMode: gstModeSchema.optional(),
    seasonNote: z.preprocess(blankToNothing, z.string().trim().max(300).optional()),
    includes: z.preprocess(blankToNothing, z.string().trim().max(500).optional()),
    details: z.array(offeringDetailSchema).max(MAX_OFFERING_DETAILS).optional(),
    active: z.boolean().optional(),
    ownerUserId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (offering) => {
      const given = [offering.fromPricePaise, offering.priceUnit, offering.gstMode].filter(
        (value) => value !== undefined,
      );
      return given.length === 0 || given.length === 3;
    },
    {
      message: 'A price needs its unit (per night...) and its GST note (included, plus or none)',
      path: ['fromPricePaise'],
    },
  );
export type CreateOfferingRequest = z.infer<typeof createOfferingRequestSchema>;

/** The list of offerings. `active=true` gives only the ones that are switched on, `active=false` only the ones that are off. */
export const listOfferingsQuerySchema = z.object({ active: z.enum(['true', 'false']).optional() });
export type ListOfferingsQuery = z.infer<typeof listOfferingsQuerySchema>;

export const offeringsResponseSchema = z.object({ items: z.array(offeringSchema) });
export type OfferingsResponse = z.infer<typeof offeringsResponseSchema>;

/** For an edit: a blank text, like an emptied form field, means "clear it". Leaving the key out means "leave it as it is". */
const clearIfBlank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/**
 * What a manager sends to change an offering: only the fields sent change. `null` (or blank text) clears the description, the season
 * note, what is included, or the owner. **`fromPricePaise: null` takes the price away completely** (its unit and GST note go with it);
 * a price needs its unit and GST note, so adding a price to an offering that has none must send all three. `details` replaces the whole
 * list. `active` switches it on or off. The position has its own route (reorder), and the business, the creator and the removal state
 * can never be sent.
 */
export const updateOfferingRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the offering a name').max(120).optional(),
    description: z.preprocess(clearIfBlank, z.string().trim().max(1000).nullable().optional()),
    fromPricePaise: z.number().int('Use whole paise').min(0).max(MAX_PRICE_PAISE).nullable().optional(),
    priceUnit: z.preprocess(clearIfBlank, z.string().trim().min(1).max(40).nullable().optional()),
    gstMode: gstModeSchema.nullable().optional(),
    seasonNote: z.preprocess(clearIfBlank, z.string().trim().max(300).nullable().optional()),
    includes: z.preprocess(clearIfBlank, z.string().trim().max(500).nullable().optional()),
    details: z.array(offeringDetailSchema).max(MAX_OFFERING_DETAILS).optional(),
    active: z.boolean().optional(),
    ownerUserId: z.uuid().nullable().optional(),
  })
  .strict();
export type UpdateOfferingRequest = z.infer<typeof updateOfferingRequestSchema>;

/**
 * What a manager sends to put the offerings in a new order: the ids of ALL the business's live offerings (on and off), each once, in
 * the new order. The API checks the list is exactly the business's offerings.
 */
export const reorderOfferingsRequestSchema = z
  .object({ offeringIds: z.array(z.uuid()).min(1).max(MAX_OFFERINGS) })
  .strict();
export type ReorderOfferingsRequest = z.infer<typeof reorderOfferingsRequestSchema>;

/** The most live offers one business may have (a guard against runaway imports). */
export const MAX_OFFERS = 200;

/** The address part naming an offer. */
export const offerIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What a manager sends to add an offer: the words and the last day it is on (a plain date like 2026-12-31, today or later in the
 * business's time zone). Anything else in the body is refused.
 */
export const createOfferRequestSchema = z
  .object({
    text: z.string().trim().min(1, 'Say what the offer is').max(300),
    endsOn: calendarDateSchema,
  })
  .strict();
export type CreateOfferRequest = z.infer<typeof createOfferRequestSchema>;

/** The list of offers. By default only the ones still on; `include=expired` adds the ones whose last day has passed. */
export const listOffersQuerySchema = z.object({ include: z.enum(['expired']).optional() });
export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;

export const offersResponseSchema = z.object({ items: z.array(offerSchema) });
export type OffersResponse = z.infer<typeof offersResponseSchema>;

/**
 * What a manager sends to change an offer: the words and/or the last day. Only the fields sent change. A new last day must be today or
 * later in the business's time zone (giving an ended offer a new last day brings it back). Anything else is refused.
 */
export const updateOfferRequestSchema = z
  .object({
    text: z.string().trim().min(1, 'Say what the offer is').max(300).optional(),
    endsOn: calendarDateSchema.optional(),
  })
  .strict();
export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;
