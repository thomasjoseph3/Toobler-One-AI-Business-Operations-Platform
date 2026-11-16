import { describe, expect, it } from 'vitest';
import { createWindowLimiter } from './window-limiter';

const start = new Date('2026-11-16T10:00:00Z');
const later = (seconds: number) => new Date(start.getTime() + seconds * 1000);

describe('window limiter', () => {
  it('allows up to the maximum and refuses the next', () => {
    const limiter = createWindowLimiter({ max: 2, windowMilliseconds: 60_000 });
    expect(limiter.tryTake('a', start)).toBe(true);
    expect(limiter.tryTake('a', later(1))).toBe(true);
    expect(limiter.tryTake('a', later(2))).toBe(false);
  });

  it('counts every name separately', () => {
    const limiter = createWindowLimiter({ max: 1, windowMilliseconds: 60_000 });
    expect(limiter.tryTake('a', start)).toBe(true);
    expect(limiter.tryTake('b', start)).toBe(true);
    expect(limiter.tryTake('a', later(1))).toBe(false);
  });

  it('starts again when the window is over', () => {
    const limiter = createWindowLimiter({ max: 1, windowMilliseconds: 60_000 });
    expect(limiter.tryTake('a', start)).toBe(true);
    expect(limiter.tryTake('a', later(59))).toBe(false);
    expect(limiter.tryTake('a', later(61))).toBe(true);
  });
});
