import { describe, expect, it } from 'vitest';
import { isCommonPassword } from './common-passwords';

describe('isCommonPassword', () => {
  it('refuses well-known passwords, whatever the capitals and punctuation', () => {
    for (const password of [
      'password123',
      'Password123!',
      'Passw0rd!!',
      'QWERTYUIOP',
      'iloveyou123',
      'Welcome-123',
      '1234567890',
    ]) {
      expect(isCommonPassword(password), password).toBe(true);
    }
  });

  it('refuses one repeated character and straight runs of digits, up or down', () => {
    for (const password of ['aaaaaaaaaa', '1111111111', '345678901234', '987654321098', '5555 5555 55']) {
      expect(isCommonPassword(password), password).toBe(true);
    }
  });

  it('accepts ordinary good passwords, including ones that merely contain a common word', () => {
    for (const password of [
      'river-lamp-kettle-42',
      'Correct Horse Battery',
      'my-password-is-long-enough-7',
      '13579246801',
    ]) {
      expect(isCommonPassword(password), password).toBe(false);
    }
  });
});
