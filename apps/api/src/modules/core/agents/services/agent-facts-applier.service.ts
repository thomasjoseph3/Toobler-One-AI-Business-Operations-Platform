import type { AccountContext, Actor } from '../../../../kernel/context';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { DomainEvent } from '../../../../kernel/events/events';
import { publishEvent } from '../../../../kernel/events/publish';
import { findOrCreateCompanyByName } from '../../companies';
import { setContactCompanyIfNone } from '../../contacts';
import * as conversationFactsRepository from '../repositories/conversation-facts.repository';

/** Who is stamped on what the AI added: the agent. */
const AGENT_ACTOR: Actor = { kind: 'agent', id: 'save_details' };

/**
 * Reacts to "a conversation's outcomes were carried out" (the conversations module made or found the contact and its lead or ticket): adds what the
 * AI learned to the records. So far that is the company the customer named ("I'm booking for Infosys HR"): the company is found by its name
 * (capitals and spaces do not matter) or made, and the contact is put in it, but only when the contact is not in a company yet (what staff chose
 * is never overridden). Safe to run more than once for the same event: the second time the contact already has its company. The customer's
 * words are never put in the event or the activity log, only ids and field names.
 */
export async function handleOutcomesApplied(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const conversationId = event.payload['conversationId'];
  const contactId = event.payload['contactId'];
  if (typeof conversationId !== 'string' || typeof contactId !== 'string') return;
  const { accountId } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const state = await conversationFactsRepository.findConversationState(transaction, accountId, conversationId);
    const companyName = state?.details['Company'];
    if (companyName === undefined) return;
    const company = await findOrCreateCompanyByName(transaction, { accountId, name: companyName, actor: AGENT_ACTOR });
    if (!company) return;
    const wasPutIn = await setContactCompanyIfNone(transaction, {
      accountId,
      contactId,
      companyId: company.companyId,
      actor: AGENT_ACTOR,
    });
    if (!wasPutIn) return;
    // Stamped as the agent (not as the system handler), because the AI is who made the change
    await writeActivityLog(transaction, {
      accountId,
      actor: AGENT_ACTOR,
      kind: 'contacts.company_changed',
      details: { recordType: 'contact', recordId: contactId, fields: ['companyId'] },
    });
    await publishEvent(transaction, {
      accountId,
      eventName: 'contact.company_changed',
      payload: {
        contactId,
        fromCompanyId: null,
        toCompanyId: company.companyId,
        by: { kind: AGENT_ACTOR.kind, id: AGENT_ACTOR.id },
      },
    });
  });
}
