import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

/**
 * Moves the leads of one contact to another. Used by the duplicates module when two contacts are merged: it runs inside the merge's own transaction, so the move
 * is saved or rolled back together with the rest of the merge. Returns how many rows moved.
 */
export async function moveLeadsToContact(
  transaction: Db,
  options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
): Promise<number> {
  return leadsRepository.moveLeadsToContact(transaction, options);
}

/** Whether the contact has an open lead. A merge of two contacts is refused when both have one (a contact has at most one open lead). */
export async function contactHasOpenLead(transaction: Db, accountId: string, contactId: string): Promise<boolean> {
  return leadsRepository.contactHasOpenLead(transaction, accountId, contactId);
}
