import {
  MAX_ACTIVE_CONVERSATION_TYPES,
  type ConversationType,
  type ConversationTypesListResponse,
  type ReorderConversationTypesRequest,
  type UpdateConversationTypeRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, badRequest, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { isTooManyActiveTypesError, tooManyTypesError } from '../helpers/conversation-type-errors';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import type { ConversationTypeChanges } from '../repositories/conversation-types.repository';
import { toConversationType } from './conversation-types.service';
import { ensureStartingConversationTypes } from './starting-conversation-types.service';

/** Changing conversation types: editing one, and putting them in a new order. The routes call this. */
export function createConversationTypeChangesService({ database }: { database: Database }) {
  return {
    /**
     * Changes the fields that were sent on one type. 404 for an unknown type or another business's. The system types can be
     * renamed and re-routed but never switched off (the router needs them), 409. A ticket outcome needs a ticket kind and
     * priority; a move to any other outcome clears them, 400 when they are sent anyway. Switching a type on past the limit of
     * 25 active types answers 409. Writes an activity-log line naming the fields, never their words. Answers with the type.
     */
    async updateConversationType(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      typeId: string,
      request: UpdateConversationTypeRequest,
    ): Promise<ConversationType> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const current = await conversationTypesRepository.findConversationTypeById(transaction, accountId, typeId);
          if (!current) throw notFound('That conversation type');

          if (current.isSystem && request.isActive === false) {
            throw conflict(
              'SYSTEM_TYPE_ALWAYS_ON',
              'The built-in conversation types stay switched on. You can rename one or change what happens to it.',
            );
          }

          // The ticket fields that go with the outcome (a ticket needs both; anything else has none)
          const newOutcome = request.outcome ?? current.outcome;
          const ticketFieldsSent = request.ticketType !== undefined || request.priority !== undefined;
          let ticketFieldChanges: Pick<ConversationTypeChanges, 'ticketType' | 'priority'> = {};
          if (newOutcome === 'ticket') {
            const ticketType = request.ticketType ?? current.ticketType;
            const priority = request.priority ?? current.priority;
            if (ticketType === null || priority === null) {
              throw badRequest('A ticket outcome needs a ticket type and a priority.');
            }
            ticketFieldChanges = { ticketType, priority };
          } else if (ticketFieldsSent) {
            throw badRequest('Only a ticket outcome takes a ticket type and a priority.');
          } else if (current.outcome === 'ticket') {
            // Moving away from a ticket outcome: the ticket fields no longer apply
            ticketFieldChanges = { ticketType: null, priority: null };
          }

          // Switching a type on again counts towards the limit of 25 (the database enforces it too)
          if (request.isActive === true && !current.isActive) {
            const activeCount = await conversationTypesRepository.countActiveConversationTypes(transaction, accountId);
            if (activeCount >= MAX_ACTIVE_CONVERSATION_TYPES) throw tooManyTypesError();
          }

          const changes: ConversationTypeChanges = {
            ...(request.label !== undefined ? { label: request.label } : {}),
            ...(request.description !== undefined ? { description: request.description } : {}),
            ...(request.examples !== undefined ? { examples: request.examples } : {}),
            ...(request.outcome !== undefined ? { outcome: request.outcome } : {}),
            ...ticketFieldChanges,
            ...(request.needsPerson !== undefined ? { needsPerson: request.needsPerson } : {}),
            ...(request.alert !== undefined ? { alert: request.alert } : {}),
            ...(request.playbook !== undefined ? { playbook: request.playbook } : {}),
            ...(request.isActive !== undefined ? { isActive: request.isActive } : {}),
            actor,
          };
          await conversationTypesRepository.updateConversationType(transaction, accountId, typeId, changes);

          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'conversations.type_updated',
            // Which fields were sent, never their values
            details: {
              recordType: 'conversation_type',
              recordId: typeId,
              fields: Object.keys(request).filter(
                (field) => request[field as keyof UpdateConversationTypeRequest] !== undefined,
              ),
            },
          });

          const updated = await conversationTypesRepository.findConversationTypeById(transaction, accountId, typeId);
          if (!updated) throw new Error('The conversation type that was just changed could not be read back.');
          return toConversationType(updated);
        });
      } catch (error) {
        // Two requests at the same moment can both pass the check above; the database's own rule (migration 032) stops the second
        if (isTooManyActiveTypesError(error)) throw tooManyTypesError();
        throw error;
      }
    },

    /**
     * Puts the business's types in a new order: the request must list every type of the business exactly once, and nothing
     * else, or it answers 400 (and so it never says whether an id belongs to another business). Positions become 0, 1, 2, with
     * no gaps. Sending the order it already has changes nothing and writes no log line. Answers with the list in its new order.
     */
    async reorderConversationTypes(
      principal: Pick<Principal, 'accountId' | 'userId' | 'industryId'>,
      request: ReorderConversationTypesRequest,
    ): Promise<ConversationTypesListResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Reordering works out positions from what is there, so it takes its turn with adding
        await conversationTypesRepository.lockConversationTypesOfBusiness(transaction, accountId);
        await ensureStartingConversationTypes(transaction, { accountId, industryId: principal.industryId });

        const currentIds = await conversationTypesRepository.listConversationTypeIdsInOrder(transaction, accountId);
        const requestedIds = new Set(request.typeIds);
        const listsEveryTypeOnce =
          requestedIds.size === request.typeIds.length &&
          requestedIds.size === currentIds.length &&
          currentIds.every((typeId) => requestedIds.has(typeId));
        if (!listsEveryTypeOnce) {
          throw new ApiError(
            400,
            'TYPES_MISMATCH',
            'List every conversation type of the business exactly once, and nothing else.',
            {
              expected: currentIds.length,
              received: request.typeIds.length,
            },
          );
        }

        const alreadyInThatOrder = currentIds.every((typeId, index) => request.typeIds[index] === typeId);
        const currentPositions = await conversationTypesRepository.listConversationTypePositions(
          transaction,
          accountId,
        );
        const positionsAlreadyTidy = currentPositions.every((position, index) => position === index);
        if (!(alreadyInThatOrder && positionsAlreadyTidy)) {
          await conversationTypesRepository.setConversationTypePositions(transaction, {
            accountId,
            typeIdsInOrder: request.typeIds,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'conversations.types_reordered',
            details: { recordType: 'conversation_type', fields: ['order'] },
          });
        }

        const rows = await conversationTypesRepository.listConversationTypes(transaction, accountId);
        return { items: rows.map(toConversationType) };
      });
    },
  };
}
