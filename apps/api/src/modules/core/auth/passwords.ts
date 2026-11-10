import { hash, verify } from '@node-rs/argon2';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@toobler-one/shared';
import { COMMON_PASSWORDS, COMMON_ROOTS } from './common-passwords';

// argon2id (the library's default) with the settings OWASP recommends as a minimum: 19 MiB of memory, 2 passes.
const HASH_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Turns a password into the text we store. It cannot be reversed; each call gives a different text (random salt). */
export const hashPassword = (password: string): Promise<string> => hash(password, HASH_OPTIONS);

/** Whether a typed password matches a stored hash. */
export const passwordMatches = (storedHash: string, typedPassword: string): Promise<boolean> =>
  verify(storedHash, typedPassword);

/**
 * A hash nobody can match, checked when the email is unknown so that a wrong email takes as long as a wrong password
 * and accounts cannot be found by timing.
 */
export const NO_SUCH_USER_HASH: Promise<string> = hashPassword('no such user, nothing will match this');

/** What a password must not be equal to: the person's own email and mobile number. */
export interface PersonalDetails {
  email: string;
  mobileDigits: string | null;
}

/**
 * The first problem with a new password, in plain English, or null when it is fine. Rules: 10 to 128 characters, not a
 * very common password, not the person's own email or mobile number. (The length rule is also in the shared schema.)
 */
export function findPasswordProblem(password: string, personalDetails: PersonalDetails): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const lowerCasePassword = password.toLowerCase();
  const withoutTrailingDigitsAndSymbols = lowerCasePassword.replace(/[\d\W_]+$/, '');
  if (COMMON_PASSWORDS.has(lowerCasePassword) || COMMON_ROOTS.has(withoutTrailingDigitsAndSymbols)) {
    return 'That password is too common. Choose something harder to guess.';
  }
  if (new Set(lowerCasePassword).size < 4) return 'That password is too repetitive. Mix in more different characters.';
  const passwordDigits = lowerCasePassword.replace(/\D/g, '');
  if (
    lowerCasePassword === personalDetails.email.toLowerCase() ||
    (personalDetails.mobileDigits !== null &&
      passwordDigits !== '' &&
      personalDetails.mobileDigits.endsWith(passwordDigits) &&
      passwordDigits.length >= 8)
  ) {
    return 'Do not use your email address or mobile number as your password.';
  }
  return null;
}
