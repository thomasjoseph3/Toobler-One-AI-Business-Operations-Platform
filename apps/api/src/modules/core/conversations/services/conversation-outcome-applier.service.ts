import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { findOrCreateContactFromIdentity } from '../../contacts';
import { applyLeadFromConversation } from '../../leads';
import { applyTicketFromConversation } from '../../tickets';
import { shouldKeepContact } from '../helpers/router';
import * as conversationOutcomesRepository from '../repositories/conversation-outcomes.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';

/** The words for a channel in a note ("Another conversation on web chat..."). */
const CHANNEL_WORDS = { webchat: 'web chat', whatsapp: 'WhatsApp', email: 'email', phone: 'a phone call' } as const;

/** Who is stamped on the records made: whoever decided the type (the rule or the AI), or the person who corrected it. */
export function actorForDecision(typeSource: 'rule' | 'ai_final' | 'staff' | null, staffUserId?: string): Actor {
  if (typeSource === 'staff' && staffUserId !== undefined) return { kind: 'user', id: staffUserId };
  if (typeSource === 'rule') return { kind: 'system', id: 'pre-filter' };
  return { kind: 'agent', id: 'classifier' };
}

/**
 * Carries out what a sorted conversation led to (docs/CONVERSATION-TYPES.md step 4): finds or makes the contact, then for each outcome that
 * is not carried out yet makes the lead, makes or joins the ticket, or notes that nothing needs making (log, Filtered, ignored, review).
 * The lead and ticket rules (an open lead takes the enquiry, a recently lost one is reopened, an open ticket of the same kind takes a
 * note) are the leads and tickets modules' own.
 *
 * It takes the caller's transaction and locks the conversation first, so two runs at the same moment take turns, and a run that finds
 * nothing left to do changes nothing. Either everything is carried out or, if something fails, nothing is (the transaction is rolled
 * back and the job is tried again). When a lead or ticket is wanted but nobody can be identified (no phone and no email), that outcome
 * stays not carried out and the conversation is marked "needs a person", so staff see it. Returns how many were carried out and how many wait.
 */
export async function applyPendingOutcomes(
  transaction: Db,
  options: { accountId: string; conversationId: string; staffUserId?: string },
): Promise<{ carriedOut: number; waiting: number }> {
  const { accountId, conversationId } = options;
  const conversation = await conversationsRepository.lockConversationById(transaction, accountId, conversationId);
  if (!conversation || conversation.status !== 'sorted') return { carriedOut: 0, waiting: 0 };

  const pending = (
    await conversationOutcomesRepository.listOutcomesOfConversation(transaction, accountId, conversationId)
  ).filter((outcome) => outcome.supersededAt === null && outcome.appliedAt === null);
  if (pending.length === 0) return { carriedOut: 0, waiting: 0 };

  const actor = actorForDecision(conversation.typeSource, options.staffUserId);
  const types = new Map(
    (await conversationTypesRepository.listConversationTypes(transaction, accountId)).map((type) => [type.key, type]),
  );

  // The contact: the one already linked, or the one found or made from the phone or email the channel saw. A lead or a ticket always needs one.
  let contactId = conversation.contactId;
  const needsContact = pending.some(
    (outcome) =>
      outcome.kind === 'lead' || outcome.kind === 'ticket' || shouldKeepContact(outcome.typeKey, outcome.kind),
  );
  if (contactId === null && needsContact) {
    const contact = await findOrCreateContactFromIdentity(transaction, {
      accountId,
      phoneKey: conversation.fromPhoneKey ?? undefined,
      email: conversation.fromEmail ?? undefined,
      actor,
    });
    if (contact) {
      contactId = contact.contactId;
      await conversationsRepository.linkContactToConversation(transaction, {
        accountId,
        conversationId,
        contactId,
        actor,
      });
    }
  }

  let carriedOut = 0;
  let waiting = 0;
  let aPersonMustLook = false;
  for (const outcome of pending) {
    const appliedAt = new Date();
    if (outcome.kind === 'lead') {
      if (contactId === null) {
        waiting += 1;
        aPersonMustLook = true;
        continue;
      }
      const lead = await applyLeadFromConversation(transaction, {
        accountId,
        contactId,
        channel: conversation.channel,
        actor,
      });
      await conversationOutcomesRepository.markOutcomeApplied(transaction, {
        accountId,
        outcomeId: outcome.id,
        leadId: lead.leadId,
        ticketId: null,
        createdRecord: lead.action === 'created',
        appliedAt,
      });
    } else if (outcome.kind === 'ticket') {
      if (contactId === null) {
        waiting += 1;
        aPersonMustLook = true;
        continue;
      }
      const type = types.get(outcome.typeKey);
      if (!type || type.ticketType === null || type.priority === null) {
        // The type was removed (or changed) after the conversation was sorted, so what ticket to make is not known: a person decides
        aPersonMustLook = true;
        await conversationOutcomesRepository.markOutcomeApplied(transaction, {
          accountId,
          outcomeId: outcome.id,
          leadId: null,
          ticketId: null,
          appliedAt,
        });
        carriedOut += 1;
        continue;
      }
      const ticket = await applyTicketFromConversation(transaction, {
        accountId,
        contactId,
        ticketType: type.ticketType,
        priority: type.priority,
        title: type.label,
        details: conversation.typeSource === 'ai_final' ? conversation.typeReason : null,
        conversationTypeKey: type.key,
        noteWhenJoined: `Another conversation (${CHANNEL_WORDS[conversation.channel]}) was sorted as ${type.label}.`,
        actor,
      });
      await conversationOutcomesRepository.markOutcomeApplied(transaction, {
        accountId,
        outcomeId: outcome.id,
        leadId: null,
        ticketId: ticket.ticketId,
        createdRecord: ticket.action === 'created',
        appliedAt,
      });
    } else {
      // Log, Filtered, ignored, review: there is nothing to make; the type and the outcome are the record
      await conversationOutcomesRepository.markOutcomeApplied(transaction, {
        accountId,
        outcomeId: outcome.id,
        leadId: null,
        ticketId: null,
        appliedAt,
      });
    }
    carriedOut += 1;
  }

  if (aPersonMustLook) {
    await conversationsRepository.markConversationNeedsPerson(transaction, { accountId, conversationId, actor });
  }
  return { carriedOut, waiting };
}
