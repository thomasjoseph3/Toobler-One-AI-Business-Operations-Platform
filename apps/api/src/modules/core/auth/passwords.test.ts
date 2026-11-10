import { describe, expect, it } from 'vitest';
import { findPasswordProblem, hashPassword, passwordMatches } from './passwords';

const details = { email: 'anita@example.com', mobileDigits: '919847012345' };

describe('passwords', () => {
  it('hashes with argon2id, differently each time, and checks a match', async () => {
    const firstHash = await hashPassword('correct horse battery');
    const secondHash = await hashPassword('correct horse battery');
    expect(firstHash).toMatch(/^\$argon2id\$/);
    expect(firstHash).not.toBe(secondHash);
    expect(await passwordMatches(firstHash, 'correct horse battery')).toBe(true);
    expect(await passwordMatches(firstHash, 'correct horse batterY')).toBe(false);
  });

  it('accepts a good password', () => {
    expect(findPasswordProblem('river-lamp-kettle-42', details)).toBeNull();
  });

  it('refuses short, very common, repetitive and personal passwords', () => {
    expect(findPasswordProblem('short', details)).toMatch(/at least 10/);
    expect(findPasswordProblem('x'.repeat(129), details)).toMatch(/at most 128/);
    expect(findPasswordProblem('Password123', details)).toMatch(/too common/); // known common password (case ignored)
    expect(findPasswordProblem('Welcome2024!!', details)).toMatch(/too common/); // a common root with digits and symbols added
    expect(findPasswordProblem('qwertyuiop', details)).toMatch(/too common/);
    expect(findPasswordProblem('aaaaaaaaaaaa', details)).toMatch(/repetitive/);
    expect(findPasswordProblem('anita@example.com', details)).toMatch(/email/);
    expect(findPasswordProblem('9847012345', details)).toMatch(/mobile/);
  });
});
