import { describe, expect, it } from 'vitest';
import type { Offer } from '@toobler-one/shared';
import {
  buildCreateOfferRequest,
  buildUpdateOfferRequest,
  checkOfferForm,
  EMPTY_OFFER_FORM,
  formatOfferDate,
  formFromOffer,
  todayInTimeZone,
} from './offer-form';
import { moveId, pickSuggestionsToShow, suggestionKey } from './list-helpers';

const offer: Offer = {
  id: '0191f0a0-0000-7000-8000-000000000002',
  text: 'December: 10% off',
  endsOn: '2026-12-31',
  current: true,
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
};

describe('todayInTimeZone', () => {
  it("is today in the business's own zone, which can differ from UTC's", () => {
    const lateEveningUtc = new Date('2026-11-17T20:00:00.000Z'); // already 18 Nov in India (01:30), still 17 Nov in New York
    expect(todayInTimeZone('Asia/Kolkata', lateEveningUtc)).toBe('2026-11-18');
    expect(todayInTimeZone('America/New_York', lateEveningUtc)).toBe('2026-11-17');
  });
});

describe('checkOfferForm', () => {
  it('needs words and a last day that is today or later', () => {
    expect(checkOfferForm(EMPTY_OFFER_FORM, '2026-11-17')).toEqual({ text: 'Say what the offer is.', endsOn: 'Pick the last day of the offer.' });
    expect(checkOfferForm({ text: 'x', endsOn: '2026-11-16' }, '2026-11-17').endsOn).toBe('The last day cannot be in the past.');
    expect(checkOfferForm({ text: 'x', endsOn: '2026-11-17' }, '2026-11-17')).toEqual({}); // today is fine
  });
});

describe('requests', () => {
  it('builds the create request with trimmed words', () => {
    expect(buildCreateOfferRequest({ text: ' 10% off ', endsOn: '2026-12-31' })).toEqual({ text: '10% off', endsOn: '2026-12-31' });
  });

  it('sends only what changed', () => {
    expect(buildUpdateOfferRequest(offer, formFromOffer(offer))).toEqual({});
    expect(buildUpdateOfferRequest(offer, { text: offer.text, endsOn: '2027-01-05' })).toEqual({ endsOn: '2027-01-05' });
    expect(buildUpdateOfferRequest(offer, { text: 'New words', endsOn: offer.endsOn })).toEqual({ text: 'New words' });
  });

  it('shows a plain date as "31 Dec 2026", whatever the browser’s time zone', () => {
    expect(formatOfferDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatOfferDate('2026-01-05')).toBe('5 Jan 2026');
  });
});

describe('list helpers', () => {
  it('moves an id one place, and leaves the list alone at the ends or for an unknown id', () => {
    expect(moveId(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b'], 'zzz', 'up')).toEqual(['a', 'b']);
  });

  it('shows only the suggestions that are not already offerings and not dismissed, ignoring capitals', () => {
    const suggestions = [
      { name: 'Sea view room', description: null, fromPricePaise: 250000 },
      { name: 'YOGA CLASS', description: null, fromPricePaise: null },
      { name: 'Spa', description: null, fromPricePaise: null },
    ];
    const shown = pickSuggestionsToShow(suggestions, ['Yoga class'], new Set([suggestionKey(suggestions[2]!)]));
    expect(shown.map((suggestion) => suggestion.name)).toEqual(['Sea view room']);
  });
});
