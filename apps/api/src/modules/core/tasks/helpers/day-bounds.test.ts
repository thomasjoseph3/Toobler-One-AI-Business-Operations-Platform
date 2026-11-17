import { describe, expect, it } from 'vitest';
import { bucketOfTask, startOfDayInZone, startOfNextDayInZone } from './day-bounds';

describe('startOfDayInZone', () => {
  it('is local midnight in a zone ahead of UTC (Asia/Kolkata is +5:30)', () => {
    // 2026-11-17 23:00 in Kolkata is 17:30 UTC; the day started at 2026-11-16 18:30 UTC
    expect(startOfDayInZone(new Date('2026-11-17T17:30:00Z'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-16T18:30:00.000Z',
    );
  });

  it('puts a moment just after local midnight in the new day, and one just before in the old day', () => {
    expect(startOfDayInZone(new Date('2026-11-16T18:30:00Z'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-16T18:30:00.000Z',
    );
    expect(startOfDayInZone(new Date('2026-11-16T18:29:59Z'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-15T18:30:00.000Z',
    );
  });

  it('works for a zone behind UTC', () => {
    // 2026-11-17 02:00 UTC is still 2026-11-16 21:00 in New York (EST, -5)
    expect(startOfDayInZone(new Date('2026-11-17T02:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-16T05:00:00.000Z',
    );
  });

  it('follows a daylight saving change inside the day (New York, spring forward on 2026-03-08)', () => {
    expect(startOfDayInZone(new Date('2026-03-08T20:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfNextDayInZone(new Date('2026-03-08T20:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });
});

describe('startOfNextDayInZone', () => {
  it('is 24 hours after the start of an ordinary day', () => {
    expect(startOfNextDayInZone(new Date('2026-11-17T05:00:00Z'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-17T18:30:00.000Z',
    );
  });
});

describe('bucketOfTask', () => {
  const now = new Date('2026-11-17T10:00:00Z');
  const startOfTomorrow = new Date('2026-11-17T18:30:00Z');
  const task = (dueAt: string, doneAt: string | null = null) => ({
    dueAt: new Date(dueAt),
    doneAt: doneAt ? new Date(doneAt) : null,
  });

  it('puts a finished task in done, whatever its time', () => {
    expect(bucketOfTask(task('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'), now, startOfTomorrow)).toBe('done');
  });
  it('calls an open task that is already past overdue', () => {
    expect(bucketOfTask(task('2026-11-17T09:59:59Z'), now, startOfTomorrow)).toBe('overdue');
  });
  it('calls an open task due later today today, up to the start of tomorrow', () => {
    expect(bucketOfTask(task('2026-11-17T10:00:00Z'), now, startOfTomorrow)).toBe('today');
    expect(bucketOfTask(task('2026-11-17T18:29:59Z'), now, startOfTomorrow)).toBe('today');
  });
  it('calls an open task from tomorrow on upcoming', () => {
    expect(bucketOfTask(task('2026-11-17T18:30:00Z'), now, startOfTomorrow)).toBe('upcoming');
  });
});
