import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as contactListsRepository from '../repositories/contact-lists.repository';

/**
 * Puts the lists of one contact on another. Used by the duplicates module when two contacts are merged: it runs inside the merge's own transaction, so the move
 * is saved or rolled back together with the rest of the merge. Returns how many rows moved.
 */
export async function moveListMembershipsToContact(
  transaction: Db,
  options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
): Promise<number> {
  return contactListsRepository.moveListMembershipsToContact(transaction, options);
}
