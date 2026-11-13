import { describe, expect, it } from 'vitest';
import { parsePhone } from './phone';

describe('parsePhone', () => {
  it.each([
    ['098470 12345', '+919847012345'],
    ['9847012345', '+919847012345'],
    ['+91 98470-12345', '+919847012345'],
    ['0091 98470 12345', '+919847012345'],
    ['919847012345', '+919847012345'],
    ['(+91) 98470.12345', '+919847012345'],
    ['٩٨٤٧٠١٢٣٤٥', '+919847012345'],
    ['0484 2345678', '+914842345678'],
  ])('reads the Indian number %s as %s', (typed, expected) => {
    expect(parsePhone(typed, 'IN')).toEqual({ e164: expected, key: expected.slice(1) });
  });

  it('reads numbers of other countries when they come with their country code', () => {
    expect(parsePhone('+44 7700 900123', 'IN')?.e164).toBe('+447700900123');
    expect(parsePhone('+971 50 123 4567', 'IN')?.e164).toBe('+971501234567');
    expect(parsePhone('+1 (415) 555-2671', 'IN')?.e164).toBe('+14155552671');
  });

  it('reads a number typed without a country code as a number of the default country', () => {
    expect(parsePhone('050 123 4567', 'AE')?.e164).toBe('+971501234567');
    expect(parsePhone('9847012345', 'IN')?.e164).toBe('+919847012345');
  });

  it('keeps numbers of different countries apart even when their last ten digits are the same', () => {
    const indian = parsePhone('+91 77009 00123', 'IN');
    const british = parsePhone('+44 7700 900123', 'IN');
    expect(indian?.key).not.toBe(british?.key);
  });

  it('refuses text, numbers that are too short, and extensions', () => {
    expect(parsePhone('abc', 'IN')).toBeNull();
    expect(parsePhone('', 'IN')).toBeNull();
    expect(parsePhone('12345', 'IN')).toBeNull();
    expect(parsePhone('98470 12345 x123', 'IN')).toBeNull();
    expect(parsePhone('+919847012345 ext 5', 'IN')).toBeNull();
  });
});
