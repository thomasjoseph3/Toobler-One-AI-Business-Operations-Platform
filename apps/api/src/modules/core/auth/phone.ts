/** A mobile number in the two forms we store: international (`+919847012345`) and its last 10 digits for matching. */
export interface NormalisedMobile {
  e164: string;
  key: string;
}

/**
 * Turns what a person typed into a stored number, or null when it cannot be a mobile number.
 * Accepts "+91 98470 12345", "098470-12345", "9847012345" and "919847012345". A number without a country code gets the
 * default one (DEFAULT_COUNTRY_CODE, 91 for India). Spaces, dashes, dots and brackets are ignored.
 */
export function normaliseMobile(typedNumber: string, defaultCountryCode: string): NormalisedMobile | null {
  const trimmed = typedNumber.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  let internationalDigits: string;

  if (trimmed.startsWith('+')) {
    internationalDigits = digits;
  } else if (digits.startsWith('00')) {
    internationalDigits = digits.slice(2); // 0091... is +91...
  } else if (digits.startsWith('0')) {
    internationalDigits = defaultCountryCode + digits.replace(/^0+/, ''); // 098470 12345 is a national number
  } else if (digits.length === 10) {
    internationalDigits = defaultCountryCode + digits;
  } else {
    internationalDigits = digits; // 919847012345: already has its country code
  }

  if (!/^[1-9]\d{7,14}$/.test(internationalDigits)) return null;
  return { e164: `+${internationalDigits}`, key: internationalDigits.slice(-10) };
}
