import type { ConversationDetail, SetConversationTypeRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { closeLeadAsReclassified } from '../../leads';
import { closeTicketAsReclassified } from '../../tickets';
import { decide } from '../helpers/router';
import * as classificationCorrectionsRepository from '../repositories/classification-corrections.repository';
import * as conversationOutcomesRepository from '../repositories/conversation-outcomes.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';
import { applyPendingOutcomes } from './conversation-outcome-applier.service';
import { readConversationDetail, refuseOwnLeadsOnlyRole } from './conversation-reader.service';

/**
 * A person changing what a conversation was about (docs/CONVERSATION-TYPES.md step 5): "This isn't a lead: it's a service request".
 * The router runs again with the chosen type as the main type (sure, because a person said so), and what the conversation led to follows it.
 */
export function createConversationCorrectionService({ database }: { database: Database }) {
  return {
    /**
     * Sets the conversation's type to one of the business's switched-on types, as a person. 404 for an unknown conversation or another business's;
     * 403 for the "own leads only" role; 409 while the conversation is not sorted yet; 400 for a type the business does not have or has switched off.
     *
     *  - Choosing the type it already has changes nothing, except that it confirms a type the AI was only fairly sure about (no longer "AI unsure").
     *  - Otherwise the outcomes of the old type that no longer apply are set aside, and the lead or ticket this conversation itself MADE for them is
     *    taken off (the lead is kept, lost as "Reclassified (not a sale)"; the ticket is kept, closed with a note); one that only joined something
     *    that was already there, or that another conversation also joined, is left alone. The new outcomes are carried out (a ticket for a lead, a
     *    lead for a filtered conversation, and so on). The change is written down as a correction (from, to, who, when), in the activity log, and as an event.
     *
     * Everything happens in one transaction. Answers with the conversation as it is now.
     */
    async setConversationType(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      conversationId: string,
      request: SetConversationTypeRequest,
    ): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(principal);
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.lockConversationById(transaction, accountId, conversationId);
        if (!conversation) throw notFound('That conversation');
        if (conversation.status !== 'sorted' || conversation.typeKey === null) {
          throw conflict(
            'CONVERSATION_NOT_SORTED',
            'This conversation has not been sorted yet, so its type cannot be changed.',
          );
        }

        const types = await conversationTypesRepository.listConversationTypes(transaction, accountId);
        const target = types.find((type) => type.key === request.typeKey && type.isActive);
        if (!target) {
          throw new ApiError(400, 'UNKNOWN_TYPE', 'Choose one of the conversation types the business has switched on.');
        }

        // The same type: nothing changes, except that a type the AI was only fairly sure about is now confirmed by a person
        if (conversation.typeKey === target.key) {
          if (conversation.aiUnsure) {
            await conversationsRepository.confirmConversationType(transaction, { accountId, conversationId, actor });
            await conversationOutcomesRepository.clearOutcomeUnsure(transaction, {
              accountId,
              conversationId,
              typeKey: target.key,
            });
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'conversations.type_confirmed',
              details: { recordType: 'conversation', recordId: conversationId, fields: ['type'] },
            });
          }
          return readConversationDetail(transaction, accountId, conversationId);
        }

        const decision = decide(
          types.filter((type) => type.isActive),
          { primary: { typeKey: target.key, confidence: 1 }, secondary: [], needsPerson: false },
          { openLead: null, openTicket: null },
          { leadsActive: true },
        );
        const labelOf = (typeKey: string) => types.find((type) => type.key === typeKey)?.label ?? typeKey;
        const previousOutcomes = (
          await conversationOutcomesRepository.listOutcomesOfConversation(transaction, accountId, conversationId)
        ).filter((outcome) => outcome.supersededAt === null);

        const sortedAt = new Date();
        await conversationsRepository.saveSortedConversation(transaction, {
          accountId,
          conversationId,
          sorted: {
            typeKey: decision.primaryTypeKey,
            typeConfidence: 1,
            typeSource: 'staff',
            typeReason: 'corrected_by_staff',
            aiUnsure: false,
            needsPerson: decision.needsPerson,
            sortedAt,
            actor,
          },
        });
        for (const [position, outcome] of decision.outcomes.entries()) {
          await conversationOutcomesRepository.upsertOutcome(transaction, {
            id: uuidv7(),
            accountId,
            conversationId,
            typeKey: outcome.typeKey,
            kind: outcome.kind,
            confidence: outcome.confidence,
            aiUnsure: outcome.aiUnsure,
            sort: position,
          });
        }
        const typeKeysThatStillApply = decision.outcomes.map((outcome) => outcome.typeKey);
        await conversationOutcomesRepository.supersedeOutcomesExceptTypes(transaction, {
          accountId,
          conversationId,
          typeKeysToKeep: typeKeysThatStillApply,
          at: sortedAt,
        });

        // What this conversation itself made for the outcomes that no longer apply is taken off (kept in the history, never deleted)
        for (const old of previousOutcomes) {
          if (typeKeysThatStillApply.includes(old.typeKey) || !old.createdRecord) continue;
          if (old.leadId !== null) {
            const sharedWithAnotherConversation =
              (await conversationOutcomesRepository.countOtherCurrentOutcomesLinkedTo(transaction, {
                accountId,
                exceptConversationId: conversationId,
                leadId: old.leadId,
              })) > 0;
            if (!sharedWithAnotherConversation)
              await closeLeadAsReclassified(transaction, { accountId, leadId: old.leadId, actor });
          }
          if (old.ticketId !== null) {
            const sharedWithAnotherConversation =
              (await conversationOutcomesRepository.countOtherCurrentOutcomesLinkedTo(transaction, {
                accountId,
                exceptConversationId: conversationId,
                ticketId: old.ticketId,
              })) > 0;
            if (!sharedWithAnotherConversation) {
              await closeTicketAsReclassified(transaction, {
                accountId,
                ticketId: old.ticketId,
                noteText: `Closed: staff changed the type of the conversation from ${labelOf(conversation.typeKey)} to ${target.label}.`,
                actor,
              });
            }
          }
        }

        // The new outcomes (a ticket for a lead, a lead for a conversation that was filtered, ...)
        await applyPendingOutcomes(transaction, { accountId, conversationId, staffUserId: principal.userId });

        await classificationCorrectionsRepository.insertCorrection(transaction, {
          id: uuidv7(),
          accountId,
          conversationId,
          fromTypeKey: conversation.typeKey,
          toTypeKey: target.key,
          byUserId: principal.userId,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'conversations.type_corrected',
          details: { recordType: 'conversation', recordId: conversationId, fields: ['type'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'conversation.type_corrected',
          payload: { conversationId, fromTypeKey: conversation.typeKey, toTypeKey: target.key },
        });
        return readConversationDetail(transaction, accountId, conversationId);
      });
    },
  };
}
