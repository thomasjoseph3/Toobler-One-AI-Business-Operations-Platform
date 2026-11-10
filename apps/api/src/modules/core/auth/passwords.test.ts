import { verify } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { findPasswordProblem, hashPassword } from './passwords';

const details = { email: 'anita@example.com', mobileDigits: '919847012345' };

describe('passwords', () => {
  it('hashes with argon2id, differently each time, and the hash can be checked', async () => {
    const firstHash = await hashPassword('correct horse battery');
    const secondHash = await hashPassword('correct horse battery');
    expect(firstHash).toMatch(/^\$argon2id\$/);
    expect(firstHash).not.toBe(secondHash);
    expect(await verify(firstHash, 'correct horse battery')).toBe(true);
    expect(await verify(firstHash, 'correct horse batterY')).toBe(false);
  });

  it('accepts a good password', () => {
    expect(findPasswordProblem('river-lamp-kettle-42', details)).toBeNull();
  });

  it('refuses short and too long passwords, and the person own email or mobile', () => {
    expect(findPasswordProblem('short', details)).toMatch(/at least 10/);
    expect(findPasswordProblem('x'.repeat(129), details)).toMatch(/at most 128/);
    expect(findPasswordProblem('Anita@Example.com', details)).toMatch(/email/);
    expect(findPasswordProblem('9847012345', details)).toMatch(/mobile/);
  });
});
