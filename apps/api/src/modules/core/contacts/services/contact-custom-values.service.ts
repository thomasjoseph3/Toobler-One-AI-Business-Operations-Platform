import type { Contact, CustomValuesInput } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import { checkCustomAnswers, hideRemovedFieldAnswers } from '../../fields';

// The contacts' side of custom answers: the shared check and the shared hiding, for the contact fields.

/** Checks the answers sent with a contact against the contact fields (400 INVALID_CUSTOM_VALUES on a problem). An empty answer comes back as `null`. */
export function checkContactCustomAnswers(db: Db, accountId: string, answers: CustomValuesInput) {
  return checkCustomAnswers(db, accountId, 'contact', answers);
}

/** The contacts with only the answers of live contact fields. */
export function hideRemovedContactAnswers(db: Db, accountId: string, contacts: Contact[]): Promise<Contact[]> {
  return hideRemovedFieldAnswers(db, accountId, 'contact', contacts);
}
