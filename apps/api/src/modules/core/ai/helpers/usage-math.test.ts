import { describe, expect, it } from 'vitest';
import { cacheHitRate, chooseUsageRange, firstDayOfMonthText, toDayText } from './usage-math';

const now = new Date('2026-11-13T22:30:00Z');

describe('usage math', () => {
  it('writes days in UTC', () => {
    expect(toDayText(new Date('2026-11-13T23:59:59Z'))).toBe('2026-11-13');
    expect(firstDayOfMonthText(now)).toBe('2026-11-01');
    expect(firstDayOfMonthText(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-01');
  });

  it('works out the cache hit rate, and copes with no input', () => {
    expect(cacheHitRate(80, 100)).toBe(0.8);
    expect(cacheHitRate(1, 3)).toBe(0.3333);
    expect(cacheHitRate(0, 100)).toBe(0);
    expect(cacheHitRate(5, 0)).toBe(0);
  });

  it('uses this month so far when nothing is asked', () => {
    expect(chooseUsageRange({}, now)).toEqual({ from: '2026-11-01', to: '2026-11-13' });
    expect(chooseUsageRange({ from: '2026-10-01' }, now)).toEqual({ from: '2026-10-01', to: '2026-11-13' });
    expect(chooseUsageRange({ to: '2026-11-05' }, now)).toEqual({ from: '2026-11-01', to: '2026-11-05' });
  });

  it('accepts a single day and a full year, refuses a longer span', () => {
    expect(chooseUsageRange({ from: '2026-11-13', to: '2026-11-13' }, now)).toEqual({
      from: '2026-11-13',
      to: '2026-11-13',
    });
    expect(chooseUsageRange({ from: '2025-11-13', to: '2026-11-13' }, now)).toEqual({
      from: '2025-11-13',
      to: '2026-11-13',
    });
    expect(chooseUsageRange({ from: '2025-11-12', to: '2026-11-13' }, now)).toHaveProperty('problem');
  });

  it('refuses days that do not exist and a range that runs backwards', () => {
    expect(chooseUsageRange({ from: '2026-02-31' }, now)).toHaveProperty('problem');
    expect(chooseUsageRange({ from: '2026-11-14', to: '2026-11-13' }, now)).toEqual({
      problem: 'to cannot be before from',
    });
    // the default start is after an early "to": runs backwards too
    expect(chooseUsageRange({ to: '2026-10-31' }, now)).toHaveProperty('problem');
  });
});
