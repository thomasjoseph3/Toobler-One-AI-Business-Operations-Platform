import type { CreateOfferRequest, Offer, UpdateOfferRequest } from '@toobler-one/shared';

// The form for a time-limited offer, and how it turns into what the API takes. Pure: no screen, no network.

export interface OfferFormFields {
  text: string;
  /** The last day the offer is on, as a date like 2026-12-31 (what a date box gives). */
  endsOn: string;
}

export type OfferFormProblems = Partial<Record<'text' | 'endsOn', string>>;

export const EMPTY_OFFER_FORM: OfferFormFields = { text: '', endsOn: '' };

export const formFromOffer = (offer: Offer): OfferFormFields => ({ text: offer.text, endsOn: offer.endsOn });

/** Today's date in the business's own time zone, as 2026-11-17. (The API counts an offer through the end of its last day in that zone.) */
export function todayInTimeZone(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(now);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Checks the form: some words, and a last day that is today or later. Both ends are plain dates, so comparing the text compares the days. */
export function checkOfferForm(fields: OfferFormFields, today: string): OfferFormProblems {
  const problems: OfferFormProblems = {};
  if (fields.text.trim() === '') problems.text = 'Say what the offer is.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.endsOn)) problems.endsOn = 'Pick the last day of the offer.';
  else if (fields.endsOn < today) problems.endsOn = 'The last day cannot be in the past.';
  return problems;
}

export const buildCreateOfferRequest = (fields: OfferFormFields): CreateOfferRequest => ({ text: fields.text.trim(), endsOn: fields.endsOn });

/** What `PATCH /offers/{id}` takes: only what changed. */
export function buildUpdateOfferRequest(original: Offer, fields: OfferFormFields): UpdateOfferRequest {
  const request: UpdateOfferRequest = {};
  if (fields.text.trim() !== original.text) request.text = fields.text.trim();
  if (fields.endsOn !== original.endsOn) request.endsOn = fields.endsOn;
  return request;
}

/** "31 Dec 2026" for a plain date. Built from the parts so the time zone of the browser can never move the day. */
export function formatOfferDate(plainDate: string): string {
  const [year, month, day] = plainDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}
