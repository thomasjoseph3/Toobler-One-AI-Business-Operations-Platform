import { z } from 'zod';

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
