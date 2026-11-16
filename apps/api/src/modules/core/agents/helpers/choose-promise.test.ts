import type { WeeklyHoursValue } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { chooseThePromise, describeClockTime } from './choose-promise';

const INDIA = 'Asia/Kolkata';
const weekdaysNineToSix: WeeklyHoursValue = {
  days: {
    mon: { open: '09:00', close: '18:00' },
    tue: { open: '09:00', close: '18:00' },
    wed: { open: '09:00', close: '18:00' },
    thu: { open: '09:00', close: '18:00' },
    fri: { open: '09:30', close: '18:00' },
  },
};
const mondayMorning = new Date('2026-11-16T04:00:00Z'); // Monday 09:30 in India, open

describe('chooseThePromise', () => {
  it('promises a call within 15 minutes while the business is open, and works out when that is', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: mondayMorning,
      timeZone: INDIA,
      weeklyHours: weekdaysNineToSix,
    });
    expect(promise).toMatchObject({ kind: 'call_back_open', sentence: 'Our team will call you within 15 minutes.' });
    expect(promise.dueAt?.toISOString()).toBe('2026-11-16T04:15:00.000Z');
  });

  it('uses the minutes the business chose', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: mondayMorning,
      timeZone: INDIA,
      weeklyHours: weekdaysNineToSix,
      callbackMinutes: 30,
    });
    expect(promise.sentence).toBe('Our team will call you within 30 minutes.');
  });

  it('promises a call at the next opening time when closed, saying "tomorrow" when that is the day', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: new Date('2026-11-16T13:00:00Z'), // Monday 18:30, closed
      timeZone: INDIA,
      weeklyHours: weekdaysNineToSix,
    });
    expect(promise).toMatchObject({
      kind: 'call_back_closed',
      sentence: "We're closed now. Someone will call you tomorrow at 9 AM.",
    });
    expect(promise.dueAt?.toISOString()).toBe('2026-11-17T03:30:00.000Z');
  });

  it('names the day when the next opening is further away, with the minutes when there are some', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: new Date('2026-11-20T13:00:00Z'), // Friday 18:30
      timeZone: INDIA,
      weeklyHours: { days: { ...weekdaysNineToSix.days, mon: { open: '09:30', close: '18:00' } } },
    });
    expect(promise.sentence).toBe("We're closed now. Someone will call you on Monday at 9:30 AM.");
  });

  it('says "at 9 AM" with no day when it opens later today', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: new Date('2026-11-16T02:00:00Z'), // Monday 07:30
      timeZone: INDIA,
      weeklyHours: weekdaysNineToSix,
    });
    expect(promise.sentence).toBe("We're closed now. Someone will call you at 9 AM.");
  });

  it('promises the confirmation for a customer who is ready to book, open or closed, with no time of its own', () => {
    for (const now of [mondayMorning, new Date('2026-11-16T13:00:00Z')]) {
      const promise = chooseThePromise({
        situation: 'ready_to_book',
        now,
        timeZone: INDIA,
        weeklyHours: weekdaysNineToSix,
      });
      expect(promise).toEqual({
        kind: 'send_confirmation',
        sentence: "We'll send you the confirmation and booking link.",
        dueAt: null,
      });
    }
  });

  it('says it has been passed to the manager when it is not a sale', () => {
    const promise = chooseThePromise({
      situation: 'not_a_sale',
      now: mondayMorning,
      timeZone: INDIA,
      weeklyHours: weekdaysNineToSix,
    });
    expect(promise).toEqual({
      kind: 'passed_to_manager',
      sentence: "I've passed this to the manager, who will get back to you.",
      dueAt: null,
    });
  });

  it('treats a business with no hours as open', () => {
    const promise = chooseThePromise({
      situation: 'sale_enquiry',
      now: new Date('2026-11-16T22:00:00Z'),
      timeZone: INDIA,
      weeklyHours: undefined,
    });
    expect(promise.kind).toBe('call_back_open');
  });
});

describe('describeClockTime', () => {
  it('writes times the way people say them', () => {
    expect(describeClockTime('09:00')).toBe('9 AM');
    expect(describeClockTime('13:30')).toBe('1:30 PM');
    expect(describeClockTime('00:00')).toBe('12 AM');
    expect(describeClockTime('12:00')).toBe('12 PM');
  });
});
