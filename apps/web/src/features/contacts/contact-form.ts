// The rules of the Add contact form: checking what was typed and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { Contact, CreateContactRequest, UpdateContactRequest } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** Everything typed in the Add contact form, as the text boxes hold it. */
export interface ContactFormFields {
  name: string;
  phone: string;
  email: string;
  /** A two-letter language code like `en` (only edited on the contact's own page). */
  language: string;
}

export const EMPTY_CONTACT_FORM: ContactFormFields = { name: '', phone: '', email: '', language: '' };

/** What is wrong with the form, as the words to show under the box. A box that is fine has no entry. */
export interface ContactFormProblems {
  /** Neither a phone nor an email was typed. */
  contact?: MessageKey;
  email?: MessageKey;
  language?: MessageKey;
}

/** A simple "something@something.something" check; the API checks again properly. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the form on the device first: a phone or an email is needed, and an email must look like one. */
export function checkContactForm(fields: ContactFormFields): ContactFormProblems {
  const problems: ContactFormProblems = {};
  const hasPhone = fields.phone.trim() !== '';
  const hasEmail = fields.email.trim() !== '';
  if (!hasPhone && !hasEmail) problems.contact = 'contacts.form.needPhoneOrEmail';
  if (hasEmail && !EMAIL_SHAPE.test(fields.email.trim())) problems.email = 'contacts.form.emailInvalid';
  if (fields.language.trim() !== '' && !/^[a-zA-Z]{2}$/.test(fields.language.trim())) problems.language = 'contacts.form.languageInvalid';
  return problems;
}

/** Turns the typed form into the request body; boxes left empty are left out. */
export function buildCreateContactRequest(fields: ContactFormFields): CreateContactRequest {
  const request: CreateContactRequest = {};
  if (fields.name.trim() !== '') request.name = fields.name.trim();
  if (fields.phone.trim() !== '') request.phone = fields.phone.trim();
  if (fields.email.trim() !== '') request.email = fields.email.trim();
  return request;
}

/** Fills the edit form with what the contact has now (a missing value is an empty box). */
export function contactToFormFields(contact: Contact): ContactFormFields {
  return {
    name: contact.name ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    language: contact.language ?? '',
  };
}

/** The text of a box, or null when it is empty: what a cleared box means to the API. */
function textOrNull(typedText: string): string | null {
  return typedText.trim() === '' ? null : typedText.trim();
}

/**
 * Turns the edit form into the request body, with only what changed: a box that still matches the contact is left out (so
 * nothing else is touched), an emptied box is sent as null (clear it), and `notAFit` is sent only when the tick moved. An
 * empty body means nothing changed.
 */
export function buildUpdateContactRequest(
  fields: ContactFormFields,
  contact: Contact,
  isNotAFit: boolean,
): UpdateContactRequest {
  const request: UpdateContactRequest = {};
  const original = contactToFormFields(contact);
  if (fields.name.trim() !== original.name) request.name = textOrNull(fields.name);
  if (fields.phone.trim() !== original.phone) request.phone = textOrNull(fields.phone);
  if (fields.email.trim() !== original.email) request.email = textOrNull(fields.email);
  if (fields.language.trim().toLowerCase() !== original.language) request.language = textOrNull(fields.language);
  if (isNotAFit !== (contact.lifecycleStage === 'not_a_fit')) request.notAFit = isNotAFit;
  return request;
}
