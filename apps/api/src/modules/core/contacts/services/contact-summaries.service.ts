import type { Db } from '../../../../kernel/database';
import * as contactsRepository from '../repositories/contacts.repository';

/** The few facts about a contact that another module (leads) shows next to its own records. */
export interface ContactSummary {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * The live contacts among these ids, as short summaries. A deleted contact, an unknown id and another business's contact
 * are simply missing from the answer. Used by the leads module (through this module's index.ts) to show who a lead is for.
 */
export async function findContactSummaries(
  transaction: Db,
  options: { accountId: string; contactIds: string[] },
): Promise<ContactSummary[]> {
  const contacts = await contactsRepository.findContactsByIds(transaction, options.accountId, options.contactIds);
  return contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
  }));
}
