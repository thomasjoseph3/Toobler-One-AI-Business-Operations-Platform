import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

/** What a person's leads add up to. */
export interface ContactLeadTotals {
  contactId: string;
  openLeads: number;
  wonLeads: number;
  /** The combined budget of the won leads, in paise. */
  wonValuePaise: number;
}

/**
 * For each of these contacts: how many open and won leads they have, and the combined budget of the won ones. Contacts with no leads are
 * missing from the answer. Used by the companies module (through this module's index.ts) to add up a company's people. Run it inside the
 * business's own transaction.
 */
export async function findLeadTotalsForContacts(
  transaction: Db,
  options: { accountId: string; contactIds: string[] },
): Promise<ContactLeadTotals[]> {
  return leadsRepository.summariseLeadsOfContacts(transaction, options.accountId, options.contactIds);
}
