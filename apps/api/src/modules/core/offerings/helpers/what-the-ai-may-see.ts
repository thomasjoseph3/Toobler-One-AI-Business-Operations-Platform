import type { GstMode, OfferingDetail } from '@toobler-one/shared';
import { describePriceInWords } from './money-in-words';
import { isOfferCurrent } from './offer-is-current';

// What the AI agent (F19) may know about what the business sells. The agent reads ONLY what this function returns, so an
// offering that is switched off, removed, or an offer past its end date can never reach a customer. Pure: no database.

export interface OfferingForTheAgent {
  name: string;
  description: string | null;
  priceInWords: string | null;
  seasonNote: string | null;
  includes: string | null;
  details: OfferingDetail[];
}

export interface OfferForTheAgent {
  text: string;
  endsOn: string;
}

export interface WhatTheAgentMaySee {
  offerings: OfferingForTheAgent[];
  offers: OfferForTheAgent[];
}

/** An offering as the database holds it, with the facts this function needs. */
interface StoredOffering {
  name: string;
  description: string | null;
  fromPricePaise: number | null;
  priceUnit: string | null;
  gstMode: GstMode | null;
  seasonNote: string | null;
  includes: string | null;
  details: OfferingDetail[];
  active: boolean;
  deleted: boolean;
  sort: number;
}

interface StoredOffer {
  text: string;
  endsOn: string;
  deleted: boolean;
}

/**
 * The offerings and offers the AI may mention: offerings that are on and not removed, in the owner's order, each with its price in
 * words; offers that are not removed and not past their end date in the business's time zone, the ones ending soonest first.
 */
export function selectWhatTheAgentMaySee(input: {
  offerings: readonly StoredOffering[];
  offers: readonly StoredOffer[];
  now: Date;
  timeZone: string;
}): WhatTheAgentMaySee {
  const offerings = input.offerings
    .filter((offering) => offering.active && !offering.deleted)
    .sort((first, second) => first.sort - second.sort)
    .map((offering) => ({
      name: offering.name,
      description: offering.description,
      priceInWords: describePriceInWords(offering),
      seasonNote: offering.seasonNote,
      includes: offering.includes,
      details: offering.details,
    }));
  const offers = input.offers
    .filter((offer) => !offer.deleted && isOfferCurrent(offer.endsOn, input.now, input.timeZone))
    .sort((first, second) => first.endsOn.localeCompare(second.endsOn))
    .map((offer) => ({ text: offer.text, endsOn: offer.endsOn }));
  return { offerings, offers };
}
