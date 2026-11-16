import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import { applyLeadFactsToContact, lockContactForUpdate } from '../../contacts';
import { decideWhatToDoWithEnquiry } from '../helpers/open-lead-rule';
import * as leadsRepository from '../repositories/leads.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';
import { chooseOwnerForNewLead } from './assignment-rules.service';

/** The channels a conversation can come in on, in the words the conversation engine uses. */
export type ConversationChannelForLead = 'webchat' | 'whatsapp' | 'email' | 'phone';

/** What was done with the enquiry. */
export type LeadFromConversationResult =
  | { action: 'created'; leadId: string }
  /** The person already had an open lead: the enquiry joined it. */
  | { action: 'joined'; leadId: string }
  /** The person's lead was lost less than 60 days ago: it was reopened at the first stage. */
  | { action: 'reopened'; leadId: string };

/** A lead remembers its first channel in its own words (`web_chat`, with an underscore). */
function firstChannelOf(channel: ConversationChannelForLead): 'web_chat' | 'whatsapp' | 'email' | 'phone' {
  return channel === 'webchat' ? 'web_chat' : channel;
}

/**
 * Gives a new enquiry from a conversation to the right lead, by rule R6 (docs/REQUIREMENTS-REVIEW.md): the person's open lead takes it;
 * a lead lost less than 60 days ago is reopened at the first stage (the owner stays, and the `lead.reopened` event lets the alerts feature
 * tell them); otherwise a new lead is made at the first open stage, with the owner the business's sharing rule picks, and the channel
 * the conversation came in on. (A lead WON less than 60 days ago does not stop a new lead: the conversation was already sorted as a new
 * enquiry, not as a question about the purchase.) The person's lifecycle stage follows.
 *
 * It takes the caller's transaction and joins it. The contact is locked first, so two conversations from one person sorted at the same moment
 * take turns and cannot give the person two open leads. Writes the activity-log line and the event of what it did. Returns what was done.
 */
export async function applyLeadFromConversation(
  transaction: Db,
  options: { accountId: string; contactId: string; channel: ConversationChannelForLead; actor: Actor },
): Promise<LeadFromConversationResult> {
  const { accountId, contactId, actor } = options;
  if (!(await lockContactForUpdate(transaction, accountId, contactId))) {
    throw new Error('The contact for this enquiry no longer exists.');
  }

  const latestLead = await leadsRepository.findLatestLeadForContact(transaction, accountId, contactId);
  const decision = decideWhatToDoWithEnquiry({
    latestLead: latestLead ? { stageKind: latestLead.stageKind, closedAt: latestLead.closedAt } : undefined,
    now: new Date(),
  });

  if (latestLead && decision === 'attach_to_open_lead') {
    return { action: 'joined', leadId: latestLead.id };
  }

  const pipeline = await pipelineRepository.findPipelineForAccount(transaction, accountId);
  const firstOpenStage = pipeline
    ? await pipelineRepository.findFirstOpenStage(transaction, accountId, pipeline.id)
    : undefined;
  if (!firstOpenStage) throw new Error('The business has no open pipeline stage');

  let result: LeadFromConversationResult;
  if (latestLead && decision === 'reopen_lost_lead') {
    const movedAt = new Date();
    await leadsRepository.moveLeadToStage(transaction, {
      accountId,
      leadId: latestLead.id,
      stageId: firstOpenStage.id,
      closedAt: null,
      lostReason: null,
      movedAt,
      actor,
    });
    result = { action: 'reopened', leadId: latestLead.id };
    await publishEvent(transaction, {
      accountId,
      eventName: 'lead.reopened',
      payload: { leadId: latestLead.id, contactId },
    });
  } else {
    const leadId = uuidv7();
    const ownerUserId = await chooseOwnerForNewLead(transaction, { accountId, actor });
    await leadsRepository.insertLead(transaction, {
      id: leadId,
      accountId,
      contactId,
      stageId: firstOpenStage.id,
      interest: null,
      dateFrom: null,
      dateTo: null,
      partySize: null,
      budgetPaise: null,
      promise: null,
      callbackAt: null,
      ownerUserId,
      offeringId: null,
      firstChannel: firstChannelOf(options.channel),
      actor,
    });
    result = { action: 'created', leadId };
    await publishEvent(transaction, {
      accountId,
      eventName: 'lead.created',
      payload: { leadId, contactId, ownerUserId, offeringId: null },
    });
  }

  const leadFacts = await leadsRepository.countOpenAndWonLeadsForContact(transaction, accountId, contactId);
  await applyLeadFactsToContact(transaction, {
    accountId,
    contactId,
    openLeads: leadFacts.openLeads,
    wonLeads: leadFacts.wonLeads,
    actor,
  });
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: result.action === 'reopened' ? 'leads.reopened_by_conversation' : 'leads.created_by_conversation',
    details: { recordType: 'lead', recordId: result.leadId },
  });
  return result;
}
