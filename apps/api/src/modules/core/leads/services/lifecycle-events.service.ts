import type { AccountContext, Actor } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { applyLeadFactsToContact } from '../../contacts';
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
