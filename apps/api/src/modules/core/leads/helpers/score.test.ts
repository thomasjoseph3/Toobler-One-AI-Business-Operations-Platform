import { describe, expect, it } from 'vitest';
import { describeDates, scoreLead, type LeadScoreFacts } from './score';

const base: LeadScoreFacts = {
  askedToBook: false,
  askedPrice: false,
  dateFrom: null,
  dateTo: null,
  today: '2026-11-18',
};

describe('scoreLead', () => {
  it('is hot when the person asked to book, whatever else is known', () => {
    expect(scoreLead({ ...base, askedToBook: true })).toEqual({ temperature: 'hot', reason: 'Asked to book' });
  });

  it('is hot with dates within 30 days and a price question', () => {
    const score = scoreLead({ ...base, askedPrice: true, dateFrom: '2026-12-12', dateTo: '2026-12-15' });
    expect(score.temperature).toBe('hot');
    expect(score.reason).toBe('Dates 12–15 Dec (within 30 days) and asked the price');
  });

  it('counts exactly 30 days as soon, and 31 as not', () => {
    expect(scoreLead({ ...base, askedPrice: true, dateFrom: '2026-12-18' }).temperature).toBe('hot');
    expect(scoreLead({ ...base, askedPrice: true, dateFrom: '2026-12-19' }).temperature).toBe('warm');
  });

  it('is warm with far dates and a price question, with dates alone, or with a price question alone', () => {
    expect(scoreLead({ ...base, askedPrice: true, dateFrom: '2027-02-01' })).toEqual({
      temperature: 'warm',
      reason: 'Dates 1 Feb and asked the price',
    });
    expect(scoreLead({ ...base, dateFrom: '2026-12-12', dateTo: '2026-12-15' }).temperature).toBe('warm');
    expect(scoreLead({ ...base, askedPrice: true })).toEqual({ temperature: 'warm', reason: 'Asked the price' });
  });

  it('does not call dates in the past "soon"', () => {
    expect(scoreLead({ ...base, askedPrice: true, dateFrom: '2026-11-10' }).temperature).toBe('warm');
  });

  it('is cold with only general questions', () => {
    expect(scoreLead(base)).toEqual({ temperature: 'cold', reason: 'Only general questions so far' });
  });

  it('gives the same answer for the same facts', () => {
    const facts = { ...base, askedPrice: true, dateFrom: '2026-12-12' };
    expect(scoreLead(facts)).toEqual(scoreLead({ ...facts }));
  });
});

describe('describeDates', () => {
  it('writes one day, a range in one month, across months and across years', () => {
    expect(describeDates('2026-12-12', null)).toBe('12 Dec');
    expect(describeDates('2026-12-12', '2026-12-15')).toBe('12–15 Dec');
    expect(describeDates('2026-11-28', '2026-12-02')).toBe('28 Nov – 2 Dec');
    expect(describeDates('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
  });
});
