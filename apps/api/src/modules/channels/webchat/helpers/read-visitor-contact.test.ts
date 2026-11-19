import { describe, expect, it } from 'vitest';
import { readVisitorContact } from './read-visitor-contact';

describe('readVisitorContact', () => {
  it('reads a phone typed without a country code as a number of the business’s country, and tidies the email', () => {
    expect(readVisitorContact({ Phone: '98470 12345', Email: ' Asha@Example.COM ' }, 'IN')).toEqual({
      phoneKey: '919847012345',
      email: 'asha@example.com',
    });
  });

  it('keeps a number that already has its country code', () => {
    expect(readVisitorContact({ Phone: '+44 7911 123456' }, 'IN')).toEqual({ phoneKey: '447911123456' });
  });

  it('ignores what does not look like a phone or an email', () => {
    expect(readVisitorContact({ Phone: 'call me', Email: 'not an email' }, 'IN')).toEqual({});
  });

  it('gives nothing when nothing was saved', () => {
    expect(readVisitorContact({ Name: 'Asha' }, 'IN')).toEqual({});
  });
});
