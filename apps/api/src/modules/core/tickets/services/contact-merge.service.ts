import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as ticketsRepository from '../repositories/tickets.repository';

/**
 * Moves the tickets of one contact to another. Used by the duplicates module when two contacts are merged: it runs inside the merge's own transaction, so the move
 * is saved or rolled back together with the rest of the merge. Returns how many rows moved.
 */
export async function moveTicketsToContact(
  transaction: Db,
  options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
): Promise<number> {
  return ticketsRepository.moveTicketsToContact(transaction, options);
}
