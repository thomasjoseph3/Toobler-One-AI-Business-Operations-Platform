import { validateCustomValues, type Contact, type CustomValuesInput } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { findFieldDefinitions } from '../../fields';

// Everything about the answers to custom fields on contacts that is more than saving them: checking what was sent, merging it into what is stored,
// and hiding the answers of fields that were removed.

/**
 * Checks the answers sent with a contact against the business's live contact fields (the one shared check). Throws 400 INVALID_CUSTOM_VALUES with
 * the first problem in plain words. Returns the tidy answers: an empty answer is `null`, meaning "remove this key".
 */
export async function checkContactCustomAnswers(
  db: Db,
  accountId: string,
  answers: CustomValuesInput,
): Promise<Record<string, string | number | boolean | null>> {
  const definitions = await findFieldDefinitions(db, accountId, 'contact');
  const { values, problems } = validateCustomValues(definitions, answers);
  const firstProblem = problems[0];
  if (firstProblem) {
    throw new ApiError(400, 'INVALID_CUSTOM_VALUES', firstProblem.message, { problems });
  }
  return values;
}

/** The stored answers with the sent ones applied: a `null` removes its key, anything else sets it. A key that was not sent stays as it is. Pure. */
export function mergeCustomAnswers(
  stored: Readonly<Record<string, unknown>>,
  sent: Readonly<Record<string, string | number | boolean | null>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(sent)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Whether two sets of answers hold exactly the same things. Pure. */
export function sameCustomAnswers(
  first: Readonly<Record<string, unknown>>,
  second: Readonly<Record<string, unknown>>,
): boolean {
  const firstKeys = Object.keys(first);
  return firstKeys.length === Object.keys(second).length && firstKeys.every((key) => first[key] === second[key]);
}

/** The contacts with only the answers of live fields: answers kept for a removed field stay in the database but are never shown. */
export async function hideRemovedFieldAnswers(db: Db, accountId: string, contacts: Contact[]): Promise<Contact[]> {
  if (contacts.every((contact) => Object.keys(contact.custom).length === 0)) return contacts;
  const liveKeys = new Set((await findFieldDefinitions(db, accountId, 'contact')).map((definition) => definition.key));
  return contacts.map((contact) => ({
    ...contact,
    custom: Object.fromEntries(Object.entries(contact.custom).filter(([key]) => liveKeys.has(key))),
  }));
}
