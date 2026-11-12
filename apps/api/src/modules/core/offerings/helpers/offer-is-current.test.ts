import { describe, expect, it } from 'vitest';
import { isOfferCurrent, todayInTimeZone } from './offer-is-current';

describe('todayInTimeZone', () => {
  it('gives the date where the business is, which can differ from the date in UTC', () => {
    const lateEveningInLondon = new Date('2026-11-12T19:00:00Z'); // 00:30 on the 13th in India
    expect(todayInTimeZone(lateEveningInLondon, 'UTC')).toBe('2026-11-12');
    expect(todayInTimeZone(lateEveningInLondon, 'Asia/Kolkata')).toBe('2026-11-13');
    expect(todayInTimeZone(new Date('2026-11-13T03:00:00Z'), 'America/New_York')).toBe('2026-11-12');
  });
});

describe('isOfferCurrent', () => {
  it('is on through the whole last day, and off the day after', () => {
    expect(isOfferCurrent('2026-12-31', new Date('2026-12-30T10:00:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(isOfferCurrent('2026-12-31', new Date('2026-12-31T00:00:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(isOfferCurrent('2026-12-31', new Date('2026-12-31T18:29:00Z'), 'Asia/Kolkata')).toBe(true); // 23:59 in India
    expect(isOfferCurrent('2026-12-31', new Date('2026-12-31T18:30:00Z'), 'Asia/Kolkata')).toBe(false); // midnight in India
    expect(isOfferCurrent('2026-12-31', new Date('2027-01-01T10:00:00Z'), 'Asia/Kolkata')).toBe(false);
  });

  it('ends at midnight where the business is, not in UTC', () => {
    // 19:00 UTC on the 12th is already the 13th in India, but still the 12th in London
    const moment = new Date('2026-11-12T19:00:00Z');
    expect(isOfferCurrent('2026-11-12', moment, 'Asia/Kolkata')).toBe(false);
    expect(isOfferCurrent('2026-11-12', moment, 'Europe/London')).toBe(true);
    // A business behind UTC keeps the offer on later
    expect(isOfferCurrent('2026-11-12', new Date('2026-11-13T03:00:00Z'), 'America/New_York')).toBe(true);
  });

  it('keeps an offer that ended in the past off, and one far in the future on', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    expect(isOfferCurrent('2026-11-11', now, 'Asia/Kolkata')).toBe(false);
    expect(isOfferCurrent('2030-01-01', now, 'Asia/Kolkata')).toBe(true);
  });
});
