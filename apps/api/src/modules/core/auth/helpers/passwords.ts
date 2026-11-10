import { hash, verify } from '@node-rs/argon2';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@toobler-one/shared';

// argon2id (the library's default) with the settings OWASP recommends as a minimum: 19 MiB of memory, 2 passes.
const HASH_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Turns a password into the text we store. It cannot be reversed; each call gives a different text (random salt). */
export const hashPassword = (password: string): Promise<string> => hash(password, HASH_OPTIONS);

/** Whether a typed password matches a stored hash. */
export const passwordMatches = (storedHash: string, typedPassword: string): Promise<boolean> =>
  verify(storedHash, typedPassword);

/**
 * A hash that nobody's password matches. When the email is unknown, sign-in checks the typed password against this one,
 * so a wrong email takes as long as a wrong password and people cannot find out who has an account by timing.
 */
export const NO_SUCH_USER_HASH: Promise<string> = hashPassword('nobody has this password, it is only for timing');

/** What a password must not be equal to: the person's own email and mobile number. */
export interface PersonalDetails {
  email: string;
  mobileDigits: string | null;
}

/**
 * The first problem with a new password, in plain English, or null when it is fine. Rules for now: 10 to 128
 * characters, and not the person's own email or mobile number. (A list of very common passwords is added in a later slice.)
 */
export function findPasswordProblem(password: string, personalDetails: PersonalDetails): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const passwordDigits = password.replace(/\D/g, '');
  const isTheEmail = password.toLowerCase() === personalDetails.email.toLowerCase();
  const isTheMobile =
    personalDetails.mobileDigits !== null &&
    passwordDigits.length >= 8 &&
    personalDetails.mobileDigits.endsWith(passwordDigits);
  if (isTheEmail || isTheMobile) return 'Do not use your email address or mobile number as your password.';
  return null;
}
