import type { ImportSkipReason, ReadImportRow } from '@toobler-one/shared';
import type { CountryCode } from 'libphonenumber-js';
import { parsePhone } from '../../../../kernel/phone';

// Reading one row of an import as a contact's details (F12). Pure: no database. A row is only ever skipped for a reason the person can fix in the file,
// and the reason is a sentence about the kind of problem, never the row's own words.

/** The details of a row, ready to be matched and saved. */
export interface ImportedIdentity {
  /** The phone in international form and as digits, or null when the row has none. */
  phone: { e164: string; key: string } | null;
  /** The email in lower case, or null. */
  email: string | null;
  /** A two-letter language code, or null. */
  language: string | null;
}

/** A row that cannot be imported, and why. */
export interface SkippedImportRow {
  skipped: true;
  reason: ImportSkipReason;
  message: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
/** The longest email the database accepts. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Reads the phone, email and language of a row. A phone is read like one typed by hand (a number without a country code is in the business's own
 * country). A phone, email or language that is given but makes no sense skips the row (it is never guessed at or silently dropped); a row with neither
 * a phone nor an email is skipped too, because a contact must be reachable.
 */
export function readImportedIdentity(
  row: ReadImportRow,
  defaultCountry: string,
): ({ skipped?: false } & ImportedIdentity) | SkippedImportRow {
  let phone: ImportedIdentity['phone'] = null;
  if (row.phone !== undefined) {
    const parsed = parsePhone(row.phone, defaultCountry as CountryCode);
    if (!parsed) return { skipped: true, reason: 'invalid_phone', message: 'The phone number is not a valid number.' };
    phone = { e164: parsed.e164, key: parsed.key };
  }
  let email: string | null = null;
  if (row.email !== undefined) {
    const lowered = row.email.toLowerCase();
    if (!EMAIL_SHAPE.test(lowered) || lowered.length > MAX_EMAIL_LENGTH) {
      return { skipped: true, reason: 'invalid_email', message: 'The email address is not valid.' };
    }
    email = lowered;
  }
  let language: string | null = null;
  if (row.language !== undefined) {
    const lowered = row.language.toLowerCase();
    if (!/^[a-z]{2}$/u.test(lowered)) {
      return {
        skipped: true,
        reason: 'invalid_language',
        message: 'The language must be a two-letter code like en or ml.',
      };
    }
    language = lowered;
  }
  if (phone === null && email === null) {
    return { skipped: true, reason: 'no_contact_point', message: 'The row has no phone number and no email address.' };
  }
  return { phone, email, language };
}
