import { describe, expect, it } from 'vitest';
import { readSubjectOfCustomerEmail, writeCustomerEmail } from './email-words';

describe('customer email words', () => {
  it('puts the subject on the first line and reads it back', () => {
    const written = writeCustomerEmail('Rooms for 4', '  Do you have rooms?  ');
    expect(written).toBe('Subject: Rooms for 4\n\nDo you have rooms?');
    expect(readSubjectOfCustomerEmail(written)).toBe('Rooms for 4');
  });
  it('handles an email with no subject, and a message that has none', () => {
    expect(readSubjectOfCustomerEmail(writeCustomerEmail('  ', 'Hi'))).toBe('');
    expect(readSubjectOfCustomerEmail(null)).toBe('');
    expect(readSubjectOfCustomerEmail('Hello there')).toBe('');
  });
});
