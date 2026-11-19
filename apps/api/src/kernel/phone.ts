import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Phone numbers for the whole world, read with libphonenumber-js. Used by contacts (F04). F01's sign-up has its own, older
// helper (auth/helpers/phone.ts) that is left as it is, because F01 is approved.

/** What a typed number becomes: the international form to store and show, and its digits to match on. */
export interface ParsedPhone {
  /** International form with the plus, like `+919847012345`. This is what we store and what WhatsApp needs. */
  e164: string;
  /** The same number as digits only, like `919847012345`. Two contacts with the same key are the same phone. */
  key: string;
}

/**
 * Turns what a person typed into a stored number, or null when it cannot be a phone number. A number typed without a
 * country code is read as a number of `defaultCountry` (India until each business has its own setting, F16), so
 * "098470 12345", "9847012345" and "+91 98470-12345" are all the same number.
 *
 * It accepts every number the library calls *possible*, not only those it calls *valid*: its number ranges can lag behind
 * a country's newest ranges, and refusing a real customer's number (for example one the AI heard on a call) would lose that
 * customer. A number with an extension is refused, because two extensions of one switchboard are different people.
 */
export function parsePhone(typedNumber: string, defaultCountry: CountryCode): ParsedPhone | null {
  const parsed = parsePhoneNumberFromString(typedNumber.trim(), defaultCountry);
  if (!parsed || !parsed.isPossible() || parsed.ext) return null;
  return { e164: parsed.number, key: parsed.number.slice(1) };
}
