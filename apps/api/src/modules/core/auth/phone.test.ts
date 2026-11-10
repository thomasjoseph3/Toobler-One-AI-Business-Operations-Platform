import { describe, expect, it } from 'vitest';
import { normaliseMobile } from './phone';

describe('normaliseMobile', () => {
  it('understands the usual ways of typing an Indian mobile number', () => {
    for (const typed of [
      '+91 98470 12345',
      '+91-9847012345',
      '9847012345',
      '09847012345',
      '0091 9847012345',
      '919847012345',
      '(98470) 12345',
    ]) {
      expect(normaliseMobile(typed, '91'), typed).toEqual({ e164: '+919847012345', key: '9847012345' });
    }
  });
  it('keeps other countries as typed with a plus sign', () => {
    expect(normaliseMobile('+44 7911 123456', '91')).toEqual({ e164: '+447911123456', key: '7911123456' });
  });
  it('refuses what cannot be a number', () => {
    for (const typed of ['', 'abc', '12345', '+0123456789', '98470 12345 ext 3', '+', '9847012345678901234']) {
      expect(normaliseMobile(typed, '91'), typed).toBeNull();
    }
  });
});
