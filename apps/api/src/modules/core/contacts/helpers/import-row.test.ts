import { describe, expect, it } from 'vitest';
import { readImportedIdentity } from './import-row';

describe('readImportedIdentity', () => {
  it('reads a phone like one typed by hand (the business’s country when there is no country code), an email in lower case and a language', () => {
    expect(
      readImportedIdentity({ phone: '98470 12345', email: 'Priya@Menon.EXAMPLE', language: 'ML', custom: {} }, 'IN'),
    ).toEqual({
      phone: { e164: '+919847012345', key: '919847012345' },
      email: 'priya@menon.example',
      language: 'ml',
    });
    expect(readImportedIdentity({ phone: '+971 50 123 4567', custom: {} }, 'IN')).toMatchObject({
      phone: { key: '971501234567' },
    });
  });

  it('accepts a row with only a phone or only an email', () => {
    expect(readImportedIdentity({ email: 'a@b.co', custom: {} }, 'IN')).toEqual({
      phone: null,
      email: 'a@b.co',
      language: null,
    });
    expect(readImportedIdentity({ phone: '9847012345', custom: {} }, 'IN')).toMatchObject({ email: null });
  });

  it('skips a row with no way to reach the person, and says which kind of problem', () => {
    expect(readImportedIdentity({ name: 'Priya', custom: {} }, 'IN')).toMatchObject({
      skipped: true,
      reason: 'no_contact_point',
    });
    expect(readImportedIdentity({ phone: '12', custom: {} }, 'IN')).toMatchObject({
      skipped: true,
      reason: 'invalid_phone',
    });
    expect(readImportedIdentity({ phone: 'call me', custom: {} }, 'IN')).toMatchObject({ reason: 'invalid_phone' });
    expect(readImportedIdentity({ email: 'not-an-email', custom: {} }, 'IN')).toMatchObject({
      reason: 'invalid_email',
    });
    expect(readImportedIdentity({ email: `${'a'.repeat(250)}@b.co`, custom: {} }, 'IN')).toMatchObject({
      reason: 'invalid_email',
    });
    expect(readImportedIdentity({ phone: '9847012345', language: 'english', custom: {} }, 'IN')).toMatchObject({
      reason: 'invalid_language',
    });
  });

  it('never puts what the row held into the message', () => {
    const skipped = readImportedIdentity({ phone: 'secret-words-123', custom: {} }, 'IN');
    expect(JSON.stringify(skipped)).not.toContain('secret-words');
  });
});
