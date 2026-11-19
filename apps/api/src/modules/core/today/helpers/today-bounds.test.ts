import { describe, expect, it } from 'vitest';
import { lastClosingTimeInZone, startOfDayInZone, startOfNextDayInZone, startOfWeekInZone } from './today-bounds';

// 2026-11-18T10:00:00Z is a Wednesday: 10:00 in UTC, and 15:30 in Asia/Kolkata (+5:30).
const WEDNESDAY = new Date('2026-11-18T10:00:00.000Z');

describe('today-bounds in UTC (no offset, easy to read)', () => {
  it('finds the start of today and of tomorrow', () => {
    expect(startOfDayInZone(WEDNESDAY, 'UTC').toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(startOfNextDayInZone(WEDNESDAY, 'UTC').toISOString()).toBe('2026-11-19T00:00:00.000Z');
  });

  it('finds the Monday that starts this week', () => {
    expect(startOfWeekInZone(WEDNESDAY, 'UTC').toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('takes yesterday 18:00 as the last closing time when it is before 18:00 today', () => {
    expect(lastClosingTimeInZone(WEDNESDAY, 'UTC', 18).toISOString()).toBe('2026-11-17T18:00:00.000Z');
  });

  it('takes today 18:00 once it is past 18:00', () => {
    const evening = new Date('2026-11-18T20:00:00.000Z');
    expect(lastClosingTimeInZone(evening, 'UTC', 18).toISOString()).toBe('2026-11-18T18:00:00.000Z');
  });
});

describe('today-bounds in Asia/Kolkata (+5:30, so local midnight is 18:30Z the day before)', () => {
  it('finds the start of today and tomorrow in local time', () => {
    expect(startOfDayInZone(WEDNESDAY, 'Asia/Kolkata').toISOString()).toBe('2026-11-17T18:30:00.000Z');
    expect(startOfNextDayInZone(WEDNESDAY, 'Asia/Kolkata').toISOString()).toBe('2026-11-18T18:30:00.000Z');
  });

  it('finds this week local Monday', () => {
    expect(startOfWeekInZone(WEDNESDAY, 'Asia/Kolkata').toISOString()).toBe('2026-11-15T18:30:00.000Z');
  });

  it('uses yesterday 18:00 local (12:30Z) as the last closing when it is 15:30 local now', () => {
    // 18:00 IST = 12:30 UTC; it is 15:30 IST now, which is past closing, so closing is today 18:00 IST... no: 15:30 < 18:00.
    expect(lastClosingTimeInZone(WEDNESDAY, 'Asia/Kolkata', 18).toISOString()).toBe('2026-11-17T12:30:00.000Z');
  });

  it('uses today 18:00 local once it is past 18:00 local', () => {
    const eveningLocal = new Date('2026-11-18T14:00:00.000Z'); // 19:30 IST
    expect(lastClosingTimeInZone(eveningLocal, 'Asia/Kolkata', 18).toISOString()).toBe('2026-11-18T12:30:00.000Z');
  });
});
