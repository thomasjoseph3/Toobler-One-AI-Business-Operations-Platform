import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { computeLifecycleStage } from '../helpers/lifecycle';
import * as contactsRepository from '../repositories/contacts.repository';

/**
 * Works out a contact's lifecycle stage from how many open and won leads it has, and saves it if it changed. "Not a fit" is
 * staff's decision and is never overwritten. Call it inside the transaction that changed the leads. Returns nothing; a
 * contact that is missing or deleted is left alone.
 */
export async function applyLeadFactsToContact(
  transaction: Db,
  options: { accountId: string; contactId: string; openLeads: number; wonLeads: number; actor: Actor },
): Promise<void> {
  // Locked, so two lead changes for one contact at the same moment cannot overwrite each other's result
  const contact = await contactsRepository.findContactForUpdate(transaction, options.accountId, options.contactId);
  if (!contact) return;

  const newStage = computeLifecycleStage({
    markedNotAFit: contact.lifecycleStage === 'not_a_fit',
    openLeads: options.openLeads,
    wonLeads: options.wonLeads,
  });
  if (newStage === contact.lifecycleStage) return;

  await contactsRepository.updateContact(
    transaction,
    options.accountId,
    options.contactId,
    { lifecycleStage: newStage },
    options.actor,
  );
  await writeActivityLog(transaction, {
    accountId: options.accountId,
    actor: options.actor,
    kind: 'contacts.lifecycle_changed',
    details: { recordType: 'contact', recordId: options.contactId, fields: ['lifecycleStage'] },
  });
}
