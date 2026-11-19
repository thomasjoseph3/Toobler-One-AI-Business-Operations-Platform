import { describe, expect, it } from 'vitest';
import { sameJson } from './same-json';

describe('sameJson', () => {
  it('says yes to equal values, whatever the order of the keys', () => {
    expect(sameJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(sameJson('x', 'x')).toBe(true);
    expect(sameJson(null, null)).toBe(true);
    expect(sameJson([], [])).toBe(true);
  });

  it('says no to anything different, including order inside lists', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson([], {})).toBe(false);
    expect(sameJson(null, {})).toBe(false);
    expect(sameJson({ a: undefined }, { b: undefined })).toBe(false);
    expect(sameJson('1', 1)).toBe(false);
  });
});
