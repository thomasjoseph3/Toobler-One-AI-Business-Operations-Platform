import type { WeeklyHoursValue } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { findNextOpening, isOpenAt, readWallClock } from './opening-hours';

const INDIA = 'Asia/Kolkata'; // UTC+5:30 all year
const weekdaysNineToSix: WeeklyHoursValue = {
  days: {
    mon: { open: '09:00', close: '18:00' },
    tue: { open: '09:00', close: '18:00' },
    wed: { open: '09:00', close: '18:00' },
    thu: { open: '09:00', close: '18:00' },
    fri: { open: '09:00', close: '18:00' },
  },
};

describe('readWallClock (what the clock on the wall says)', () => {
  it('reads the day and time in the business time zone, not UTC', () => {
    // 2026-11-16 is a Monday. 04:00 UTC is 09:30 in India.
    expect(readWallClock(new Date('2026-11-16T04:00:00Z'), INDIA)).toMatchObject({
      weekday: 'mon',
      minutesIntoDay: 9 * 60 + 30,
      day: 16,
    });
  });

  it('moves to the next day when the time zone is ahead of UTC', () => {
    // 20:00 UTC on Monday is 01:30 on Tuesday in India
    expect(readWallClock(new Date('2026-11-16T20:00:00Z'), INDIA)).toMatchObject({ weekday: 'tue', day: 17 });
  });
});

describe('isOpenAt', () => {
  it('is open inside the hours and closed outside them, in the business time zone', () => {
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-16T04:00:00Z'), INDIA)).toBe(true); // Monday 09:30
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-16T13:00:00Z'), INDIA)).toBe(false); // Monday 18:30
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-16T02:00:00Z'), INDIA)).toBe(false); // Monday 07:30
  });

  it('opens on the opening minute and closes on the closing minute', () => {
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-16T03:30:00Z'), INDIA)).toBe(true); // exactly 09:00
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-16T12:30:00Z'), INDIA)).toBe(false); // exactly 18:00
  });

  it('is closed on a day that is not listed', () => {
    expect(isOpenAt(weekdaysNineToSix, new Date('2026-11-21T06:00:00Z'), INDIA)).toBe(false); // Saturday
  });

  it('is open all day when the business says so, and when no hours were given', () => {
    expect(isOpenAt({ allDay: true }, new Date('2026-11-21T22:00:00Z'), INDIA)).toBe(true);
    expect(isOpenAt(undefined, new Date('2026-11-21T22:00:00Z'), INDIA)).toBe(true);
  });
});

describe('findNextOpening', () => {
  it('finds today when it has not opened yet', () => {
    const next = findNextOpening(weekdaysNineToSix, new Date('2026-11-16T02:00:00Z'), INDIA); // Monday 07:30
    expect(next).toMatchObject({ when: 'today', weekday: 'mon', clockTime: '09:00' });
    expect(next?.instant.toISOString()).toBe('2026-11-16T03:30:00.000Z');
  });

  it('finds tomorrow after closing time', () => {
    const next = findNextOpening(weekdaysNineToSix, new Date('2026-11-16T13:00:00Z'), INDIA); // Monday 18:30
    expect(next).toMatchObject({ when: 'tomorrow', weekday: 'tue' });
    expect(next?.instant.toISOString()).toBe('2026-11-17T03:30:00.000Z');
  });

  it('skips the closed days: Friday evening opens on Monday', () => {
    const next = findNextOpening(weekdaysNineToSix, new Date('2026-11-20T13:00:00Z'), INDIA); // Friday 18:30
    expect(next).toMatchObject({ when: 'later', weekday: 'mon' });
    expect(next?.instant.toISOString()).toBe('2026-11-23T03:30:00.000Z');
  });

  it('gives the right instant across a clock change (New York, the Sunday the clocks go back)', () => {
    const everyDay = (open: string): WeeklyHoursValue => ({
      days: Object.fromEntries(
        ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { open, close: '17:00' }]),
      ),
    });
    // Saturday 20:30 in New York (still summer time), 2026-11-01 00:30 UTC. Sunday 09:00 is already winter time: 14:00 UTC.
    const next = findNextOpening(everyDay('09:00'), new Date('2026-11-01T00:30:00Z'), 'America/New_York');
    expect(next).toMatchObject({ when: 'tomorrow', weekday: 'sun' });
    expect(next?.instant.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('says nothing when the business is open all day or gave no hours', () => {
    expect(findNextOpening({ allDay: true }, new Date(), INDIA)).toBeUndefined();
    expect(findNextOpening(undefined, new Date(), INDIA)).toBeUndefined();
  });
});
