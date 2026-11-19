import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

/** The little another module needs to attach something to a lead: which lead, and which person it is for. */
export interface LeadReference {
  id: string;
  contactId: string;
}

/**
 * One live lead of the business as a short reference, or undefined: a deleted lead, an unknown id and another business's lead all look
 * the same. With `visibleToUserId` (the "own leads only" role) a lead owned by someone else is undefined too. Used by the notes module
 * (through this module's index.ts) before it saves a note on a lead. Run it inside the business's own transaction.
 */
export async function findLeadReference(
  transaction: Db,
  options: { accountId: string; leadId: string; visibleToUserId?: string },
): Promise<LeadReference | undefined> {
  const lead = await leadsRepository.findLeadById(
    transaction,
    options.accountId,
    options.leadId,
    options.visibleToUserId,
  );
  return lead ? { id: lead.id, contactId: lead.contactId } : undefined;
}

/**
 * Which of these leads the person may see: the live leads of the business among them, and, for the "own leads only" role (`visibleToUserId`),
 * only the ones they own. Others (deleted, unknown, another business's, not theirs) are simply missing. Used by the notes module (through
 * this module's index.ts) before it counts notes. Run it inside the business's own transaction.
 */
export async function findVisibleLeadIds(
  transaction: Db,
  options: { accountId: string; leadIds: string[]; visibleToUserId?: string },
): Promise<string[]> {
  return leadsRepository.listVisibleLeadIds(transaction, options.accountId, options.leadIds, options.visibleToUserId);
}
