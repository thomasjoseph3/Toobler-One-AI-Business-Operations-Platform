import type { AccountContext, Actor } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { applyLeadFactsToContact } from '../../contacts';
import { writeActivityLog } from '../../../../kernel/activity-log';
import * as assignmentRulesRepository from '../repositories/assignment-rules.repository';
import * as leadsRepository from '../repositories/leads.repository';

/**
 * Reacts to "staff took the 'not a fit' mark off this contact": the contacts module put the contact back to `new` without
 * knowing about leads, so here the stage is worked out again from the contact's real leads (a lead, a customer, a repeat
 * customer). Safe to run more than once for the same event: it only ever sets the stage the leads give.
 */
export async function handleContactUnmarkedNotAFit(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const contactId = event.payload['contactId'];
  if (typeof contactId !== 'string') return;
  const actor: Actor = accountContext.actor;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const leadFacts = await leadsRepository.countOpenAndWonLeadsForContact(
      transaction,
      accountContext.accountId,
      contactId,
    );
    await applyLeadFactsToContact(transaction, {
      accountId: accountContext.accountId,
      contactId,
      openLeads: leadFacts.openLeads,
      wonLeads: leadFacts.wonLeads,
      actor,
    });
  });
}

/**
 * Reacts to "a person was removed from the team": their open leads go to the person the manager chose, and the way new leads are shared out stops
 * pointing at them. Safe to run more than once for the same event: the second time they own nothing any more.
 */
export async function handleTeamMemberRemoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const removedUserId = event.payload['userId'];
  const takeOverUserId = event.payload['handOverToUserId'];
  if (typeof removedUserId !== 'string' || typeof takeOverUserId !== 'string') return;
  const actor: Actor = accountContext.actor;
  const accountId = accountContext.accountId;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const handedOverLeads = await leadsRepository.handOverOpenLeads(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    const changedRule = await assignmentRulesRepository.replacePersonInAssignmentRule(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    if (handedOverLeads > 0 || changedRule) {
      await writeActivityLog(transaction, {
        accountId,
        actor,
        kind: 'leads.handed_over',
        details: { recordType: 'user', recordId: removedUserId, fields: ['ownerUserId'] },
      });
    }
  });
}
