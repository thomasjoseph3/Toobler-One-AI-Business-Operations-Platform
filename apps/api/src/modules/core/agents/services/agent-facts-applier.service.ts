import type { CustomValue } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import type { AccountContext, Actor } from '../../../../kernel/context';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { DomainEvent } from '../../../../kernel/events/events';
import { publishEvent } from '../../../../kernel/events/publish';
import { findOrCreateCompanyByName } from '../../companies';
import { addCustomAnswersToContactWhereEmpty, setContactCompanyIfNone } from '../../contacts';
import { findFieldDefinitions } from '../../fields';
import { addCustomAnswersToLeadWhereEmpty, scoreLeadFromConversation } from '../../leads';
import { findBusinessIdentity } from '../../auth';
import type { AgentConversationState } from '../helpers/agent-conversation-state';
import { splitCustomAnswersByRecord } from '../helpers/agent-custom-answers';
import * as conversationFactsRepository from '../repositories/conversation-facts.repository';

/** A list of texts from an event's data, ignoring anything that is not text. */
function toTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

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
  const leadIds = toTexts(event.payload['leadIds']);
  if (typeof conversationId !== 'string' || typeof contactId !== 'string') return;
  const { accountId } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const state = await conversationFactsRepository.findConversationState(transaction, accountId, conversationId);
    if (!state) return;
    await addCompanyTheCustomerNamed(transaction, { accountId, contactId, companyName: state.details['Company'] });
    await addCustomAnswers(transaction, { accountId, contactId, leadIds, customAnswers: state.customAnswers });
    await scoreTheLead(transaction, { accountId, leadId: leadIds[0], state });
  });
}

/** Finds or makes the company the customer named and puts the contact in it, if the contact has none yet. Does nothing when no company was named. */
async function addCompanyTheCustomerNamed(
  transaction: Db,
  options: { accountId: string; contactId: string; companyName: string | undefined },
): Promise<void> {
  const { accountId, contactId, companyName } = options;
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
}

/**
 * Adds what the customer answered for the business's own questions to the contact and the lead, for fields they have no answer for yet (what staff
 * typed is never overridden). A field removed since the customer answered is skipped. The answers themselves are never put in the activity log:
 * only the field names.
 */
async function addCustomAnswers(
  transaction: Db,
  options: {
    accountId: string;
    contactId: string;
    leadIds: string[];
    customAnswers: Readonly<Record<string, CustomValue>>;
  },
): Promise<void> {
  const { accountId, contactId, leadIds } = options;
  if (Object.keys(options.customAnswers).length === 0) return;
  const liveContactKeys = (await findFieldDefinitions(transaction, accountId, 'contact')).map((field) => field.key);
  const liveLeadKeys = (await findFieldDefinitions(transaction, accountId, 'lead')).map((field) => field.key);
  const answers = splitCustomAnswersByRecord(options.customAnswers, { contact: liveContactKeys, lead: liveLeadKeys });

  if (Object.keys(answers.contact).length > 0) {
    await addCustomAnswersToContactWhereEmpty(transaction, {
      accountId,
      contactId,
      answers: answers.contact,
      actor: AGENT_ACTOR,
    });
    await writeActivityLog(transaction, {
      accountId,
      actor: AGENT_ACTOR,
      kind: 'contacts.custom_answers_added',
      details: { recordType: 'contact', recordId: contactId, fields: Object.keys(answers.contact) },
    });
  }
  // The conversation's lead is the first one it made or found
  const leadId = leadIds[0];
  if (leadId !== undefined && Object.keys(answers.lead).length > 0) {
    await addCustomAnswersToLeadWhereEmpty(transaction, {
      accountId,
      leadId,
      answers: answers.lead,
      actor: AGENT_ACTOR,
    });
    await writeActivityLog(transaction, {
      accountId,
      actor: AGENT_ACTOR,
      kind: 'leads.custom_answers_added',
      details: { recordType: 'lead', recordId: leadId, fields: Object.keys(answers.lead) },
    });
  }
}

/** Today's date in a time zone as a plain date like 2026-11-18. */
function findTodayIn(timeZone: string, now: Date): string {
  // The "en-CA" format writes year-month-day, which is the plain-date shape
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Gives the conversation's lead what the AI learned that scores it (the customer asked the price, asked to book, the dates they gave) and scores it by
 * the fixed rules. A conversation that made no lead (a question, a complaint) scores nothing.
 */
async function scoreTheLead(
  transaction: Db,
  options: { accountId: string; leadId: string | undefined; state: AgentConversationState },
): Promise<void> {
  const { accountId, leadId, state } = options;
  if (leadId === undefined) return;
  const identity = await findBusinessIdentity(transaction, accountId);
  if (!identity) return;
  await scoreLeadFromConversation(transaction, {
    accountId,
    leadId,
    facts: {
      askedPrice: state.askedPrice,
      askedToBook: state.situation === 'ready_to_book',
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
    },
    today: findTodayIn(identity.timeZone, new Date()),
    actor: AGENT_ACTOR,
  });
}
