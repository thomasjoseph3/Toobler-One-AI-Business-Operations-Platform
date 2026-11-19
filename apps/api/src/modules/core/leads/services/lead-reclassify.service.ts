import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { applyLeadFactsToContact, lockContactForUpdate } from '../../contacts';
import * as leadsRepository from '../repositories/leads.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';

/** The words kept on a lead that a person said was not a sale after all. */
export const RECLASSIFIED_LOST_REASON = 'Reclassified (not a sale)';

/**
 * Takes a lead off the board because staff said the conversation behind it was not a sale ("This isn't a lead: it's a service request"). The lead is
 * kept, moved to the Lost stage with the reason "Reclassified (not a sale)", so it stays in the history and can be reopened by a person; nothing is deleted.
 * A lead that is already closed (or gone) is left alone. The person's lifecycle stage follows. It takes the caller's transaction and joins it.
 * Returns true when the lead was closed now.
 */
export async function closeLeadAsReclassified(
  transaction: Db,
  options: { accountId: string; leadId: string; actor: Actor },
): Promise<boolean> {
  const { accountId, leadId, actor } = options;
  const lead = await leadsRepository.findLeadById(transaction, accountId, leadId);
  if (!lead || lead.closedAt !== null) return false;
  // The contact first, so this takes its turn with anything else that changes what the person has
  await lockContactForUpdate(transaction, accountId, lead.contactId);
  if (!(await leadsRepository.lockLeadForUpdate(transaction, accountId, leadId))) return false;

  const pipeline = await pipelineRepository.findPipelineForAccount(transaction, accountId);
  const lostStage = pipeline
    ? await pipelineRepository.findClosingStageOfKind(transaction, accountId, pipeline.id, 'lost')
    : undefined;
  if (!lostStage) throw new Error('The business has no Lost stage');

  const closedAt = new Date();
  await leadsRepository.moveLeadToStage(transaction, {
    accountId,
    leadId,
    stageId: lostStage.id,
    closedAt,
    lostReason: RECLASSIFIED_LOST_REASON,
    movedAt: closedAt,
    actor,
  });
  const leadFacts = await leadsRepository.countOpenAndWonLeadsForContact(transaction, accountId, lead.contactId);
  await applyLeadFactsToContact(transaction, {
    accountId,
    contactId: lead.contactId,
    openLeads: leadFacts.openLeads,
    wonLeads: leadFacts.wonLeads,
    actor,
  });
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: 'leads.reclassified',
    details: { recordType: 'lead', recordId: leadId, fields: ['stageId', 'lostReason'] },
  });
  await publishEvent(transaction, {
    accountId,
    eventName: 'lead.reclassified',
    payload: { leadId, contactId: lead.contactId },
  });
  return true;
}
