import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, fingerprintSecret, lastFourCharacters } from './secret-box';

const secretKey = randomBytes(32);
const accountId = '0198a1b2-0000-7000-8000-000000000001';
const plainKey = 'AIzaSyExampleKeyForTestingOnly_1234567';

describe('secret box', () => {
  it('gives back exactly what was stored', () => {
    expect(decryptSecret(encryptSecret(plainKey, secretKey, accountId), secretKey, accountId)).toBe(plainKey);
    expect(decryptSecret(encryptSecret('päss wörd ✓', secretKey, accountId), secretKey, accountId)).toBe('päss wörd ✓');
  });

  it('does not contain the secret, and is different every time', () => {
    const first = encryptSecret(plainKey, secretKey, accountId);
    const second = encryptSecret(plainKey, secretKey, accountId);
    expect(first).not.toContain(plainKey);
    expect(first).not.toContain(plainKey.slice(0, 10));
    expect(first).not.toBe(second);
    expect(first.startsWith('v1.')).toBe(true);
  });

  it('refuses a stored value that was changed', () => {
    const stored = encryptSecret(plainKey, secretKey, accountId);
    const parts = stored.split('.');
    const flipped = Buffer.from(parts[3] as string, 'base64url');
    flipped[0] = (flipped[0] as number) ^ 1;
    expect(() =>
      decryptSecret([...parts.slice(0, 3), flipped.toString('base64url')].join('.'), secretKey, accountId),
    ).toThrow();
  });

  it("refuses a value copied into another business's row", () => {
    const stored = encryptSecret(plainKey, secretKey, accountId);
    expect(() => decryptSecret(stored, secretKey, '0198a1b2-0000-7000-8000-000000000002')).toThrow();
  });

  it('refuses a value made with another server secret', () => {
    const stored = encryptSecret(plainKey, secretKey, accountId);
    expect(() => decryptSecret(stored, randomBytes(32), accountId)).toThrow();
  });

  it('refuses text that is not a stored secret', () => {
    expect(() => decryptSecret('not a secret', secretKey, accountId)).toThrow(/format/);
    expect(() => decryptSecret('v2.a.b.c', secretKey, accountId)).toThrow(/format/);
  });

  it('fingerprints: the same secret gives the same print, another secret or another scope gives another', () => {
    const print = fingerprintSecret(plainKey, secretKey, 'acc:gemini');
    expect(print).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintSecret(plainKey, secretKey, 'acc:gemini')).toBe(print);
    expect(fingerprintSecret(`${plainKey}x`, secretKey, 'acc:gemini')).not.toBe(print);
    expect(fingerprintSecret(plainKey, secretKey, 'acc:openai')).not.toBe(print);
    expect(fingerprintSecret(plainKey, randomBytes(32), 'acc:gemini')).not.toBe(print);
    expect(print).not.toContain(plainKey);
  });

  it('shows the last four characters', () => {
    expect(lastFourCharacters(plainKey)).toBe('4567');
  });
});
