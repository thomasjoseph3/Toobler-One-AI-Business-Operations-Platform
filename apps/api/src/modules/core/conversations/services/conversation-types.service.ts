import {
  MAX_ACTIVE_CONVERSATION_TYPES,
  type ConversationType,
  type ConversationTypesListResponse,
  type CreateConversationTypeRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { isTooManyActiveTypesError, tooManyTypesError } from '../helpers/conversation-type-errors';
import { makeTypeKeyFromLabel } from '../helpers/default-conversation-types';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import type { ConversationTypeRow } from '../repositories/conversation-types.repository';
import { ensureStartingConversationTypes } from './starting-conversation-types.service';

/** Turns a database row into the ConversationType the API answers with. */
export function toConversationType(row: ConversationTypeRow): ConversationType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    examples: row.examples,
    isSystem: row.isSystem,
    outcome: row.outcome,
    ticketType: row.ticketType,
    priority: row.priority,
    needsPerson: row.needsPerson,
    alert: row.alert,
    playbook: row.playbook,
    isActive: row.isActive,
    sort: row.sort,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Reading, adding and removing conversation types. The routes call this. */
export function createConversationTypesService({ database }: { database: Database }) {
  return {
    /**
     * The business's types in the order they are shown. A business that has none yet is given its starting types first
     * (this is how existing businesses get theirs). Every role can read the list.
     */
    async listConversationTypes(
      principal: Pick<Principal, 'accountId' | 'industryId'>,
    ): Promise<ConversationTypesListResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        await ensureStartingConversationTypes(transaction, {
          accountId: principal.accountId,
          industryId: principal.industryId,
        });
        const rows = await conversationTypesRepository.listConversationTypes(transaction, principal.accountId);
        return { items: rows.map(toConversationType) };
      });
    },

    /**
     * Adds a custom type at the end of the list. The key is made from the label; a label that gives a key the business
     * already uses answers 409, and so does a business that already has 25 active types (checked here for a friendly answer, and by the database for requests that arrive together). Writes an activity-log line.
     * Answers with the new type.
     */
    async createConversationType(
      principal: Pick<Principal, 'accountId' | 'userId' | 'industryId'>,
      request: CreateConversationTypeRequest,
    ): Promise<ConversationType> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Adding works out the next position from what is there, so it takes its turn with reordering
          await conversationTypesRepository.lockConversationTypesOfBusiness(transaction, accountId);
          await ensureStartingConversationTypes(transaction, { accountId, industryId: principal.industryId });

          const activeCount = await conversationTypesRepository.countActiveConversationTypes(transaction, accountId);
          if (activeCount >= MAX_ACTIVE_CONVERSATION_TYPES) throw tooManyTypesError();

          const typeId = uuidv7();
          const highestSort = await conversationTypesRepository.findHighestSort(transaction, accountId);
          const wasAdded = await conversationTypesRepository.insertConversationTypeIfKeyIsFree(transaction, {
            id: typeId,
            accountId,
            key: makeTypeKeyFromLabel(request.label),
            label: request.label,
            description: request.description,
            examples: request.examples ?? [],
            isSystem: false,
            outcome: request.outcome,
            ticketType: request.ticketType ?? null,
            priority: request.priority ?? null,
            needsPerson: request.needsPerson ?? false,
            alert: request.alert ?? null,
            playbook: request.playbook ?? (request.outcome === 'lead' ? 'sales' : 'service'),
            sort: highestSort + 1,
            actor,
          });
          if (!wasAdded) {
            throw conflict(
              'TYPE_EXISTS',
              'You already have a conversation type with a very similar name. Pick another name.',
            );
          }

          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'conversations.type_created',
            // Which type, never the words written in it
            details: { recordType: 'conversation_type', recordId: typeId },
          });

          const created = await conversationTypesRepository.findConversationTypeById(transaction, accountId, typeId);
          if (!created) throw new Error('The conversation type that was just added could not be read back.');
          return toConversationType(created);
        });
      } catch (error) {
        // Two requests at the same moment can both pass the check above; the database's own rule (migration 032) stops the second
        if (isTooManyActiveTypesError(error)) throw tooManyTypesError();
        throw error;
      }
    },

    /**
     * Removes a custom type. 404 for an unknown type or another business's; the built-in types cannot be removed, 409. A
     * conversation that already has this type keeps its own record (when conversations arrive, slice 7, they move to
     * "unclear"). Writes an activity-log line. Answers with nothing.
     */
    async deleteConversationType(principal: Pick<Principal, 'accountId' | 'userId'>, typeId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      await database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await conversationTypesRepository.findConversationTypeById(transaction, accountId, typeId);
        if (!current) throw notFound('That conversation type');
        if (current.isSystem) {
          throw conflict(
            'SYSTEM_TYPE_CANNOT_BE_REMOVED',
            'The built-in conversation types cannot be removed. You can rename one or change what happens to it.',
          );
        }
        await conversationTypesRepository.deleteConversationType(transaction, accountId, typeId);
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'conversations.type_removed',
          details: { recordType: 'conversation_type', recordId: typeId },
        });
      });
    },
  };
}
