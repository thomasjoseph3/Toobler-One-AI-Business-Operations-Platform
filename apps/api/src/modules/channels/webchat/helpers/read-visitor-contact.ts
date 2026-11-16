import type { CountryCode } from 'libphonenumber-js';
import { parsePhone } from '../../../../kernel/phone';

// Finds the visitor's phone number and email in what the agent saved about the chat. Pure: no database.

/** What could be linked to the conversation: the phone as digits only, and the email in lower case. Either may be missing. */
export interface VisitorContact {
  phoneKey?: string;
  email?: string;
}

/** A simple shape check: no spaces, one @, a dot in the part after it, within the database's length limit. */
function looksLikeEmail(text: string): boolean {
  return text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/**
 * Reads the "Phone" and "Email" the agent saved from the visitor's own words. A phone typed without a country code is read as a number of
 * the business's country. Anything that does not look like a phone or an email is ignored (the agent already asks the visitor to check it).
 */
export function readVisitorContact(
  details: Readonly<Record<string, string>>,
  defaultCountry: CountryCode,
): VisitorContact {
  const contact: VisitorContact = {};
  const typedPhone = details['Phone'];
  if (typedPhone !== undefined) {
    const parsed = parsePhone(typedPhone, defaultCountry);
    if (parsed) contact.phoneKey = parsed.key;
  }
  const typedEmail = details['Email']?.trim().toLowerCase();
  if (typedEmail !== undefined && looksLikeEmail(typedEmail)) contact.email = typedEmail;
  return contact;
}
