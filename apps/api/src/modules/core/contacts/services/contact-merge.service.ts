import type { Contact } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as contactsRepository from '../repositories/contacts.repository';
import type { MergedContactValues } from '../repositories/contacts.repository';

// What the duplicates module (F13) needs from contacts. Every function takes the caller's transaction, so it saves or rolls back with the merge.

export type { MergedContactValues };

/** Every live contact's id, name, phone and email, for finding contacts that look like one person. */
export async function findContactsForDuplicateCheck(
  transaction: Db,
  accountId: string,
): Promise<Array<{ id: string; name: string | null; phone: string | null; email: string | null }>> {
  return contactsRepository.listContactsForMatching(transaction, accountId);
}

/** The live contacts among these ids, in full. A deleted or merged-away contact and another business's contact are simply missing. */
export async function findContactsByIds(
  transaction: Db,
  options: { accountId: string; contactIds: string[] },
): Promise<Contact[]> {
  return contactsRepository.findContactsByIds(transaction, options.accountId, options.contactIds);
}

/** Merges one live contact into another (see the repository). Returns false when either contact is gone. */
export async function mergeContactInto(
  transaction: Db,
  options: { accountId: string; keptId: string; mergedAwayId: string; values: MergedContactValues; actor: Actor },
): Promise<boolean> {
  return contactsRepository.mergeContactInto(transaction, options);
}

/** Moves the people of one company to another company (the merge of two companies). Returns how many moved. */
export async function moveContactsToCompany(
  transaction: Db,
  options: { accountId: string; fromCompanyId: string; toCompanyId: string; actor: Actor },
): Promise<number> {
  return contactsRepository.moveCompanyOfContacts(transaction, options);
}
