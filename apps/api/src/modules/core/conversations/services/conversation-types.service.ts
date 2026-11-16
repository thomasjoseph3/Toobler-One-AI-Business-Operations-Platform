import {
  MAX_ACTIVE_CONVERSATION_TYPES,
  type ConversationType,
  type ConversationTypesListResponse,
  type CreateConversationTypeRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { conflict } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { listStartingConversationTypes, makeTypeKeyFromLabel } from '../helpers/default-conversation-types';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import type { ConversationTypeRow } from '../repositories/conversation-types.repository';

// The database error code for "a check failed", which the active-types rule (migration 032) uses when a business would go over 25.
const CHECK_VIOLATION = '23514';

/** True when the error is the database refusing a 26th active type (two requests at the same moment can get past the friendly check). */
const isTooManyActiveTypesError = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  error.code === CHECK_VIOLATION &&
  error.message.includes('too_many_active_conversation_types');

/** The 409 answer for a business that already has the most active types. */
const tooManyTypesError = () =>
  conflict(
    'TOO_MANY_TYPES',
    `A business can have up to ${MAX_ACTIVE_CONVERSATION_TYPES} active conversation types. Switch one off or remove one first.`,
  );

/** Turns a database row into the ConversationType the API answers with. */
function toConversationType(row: ConversationTypeRow): ConversationType {
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

/**
 * Gives a business its starting types (the system types plus its industry's extras) when it has none yet. Safe to call
 * again and again: a business that already has types is left alone. Runs inside the business's own transaction.
 * Returns nothing.
 */
export async function ensureStartingConversationTypes(
  transaction: Db,
  options: { accountId: string; industryId: string },
): Promise<void> {
  const { accountId, industryId } = options;
  if ((await conversationTypesRepository.countConversationTypes(transaction, accountId)) > 0) return;

  const actor: Actor = { kind: 'system', id: null };
  const startingTypes = listStartingConversationTypes(industryId);
  const systemKeys = new Set(listStartingConversationTypes('general').map((type) => type.key));
  for (const [position, type] of startingTypes.entries()) {
    await conversationTypesRepository.insertConversationTypeIfKeyIsFree(transaction, {
      id: uuidv7(),
      accountId,
      key: type.key,
      label: type.label,
      description: type.description,
      examples: type.examples,
      isSystem: systemKeys.has(type.key),
      outcome: type.outcome,
      ticketType: type.ticketType ?? null,
      priority: type.priority ?? null,
      needsPerson: type.needsPerson,
      alert: type.alert,
      playbook: type.playbook,
      sort: position,
      actor,
    });
  }
}

/** Everything about conversation types that is not plain reading of the database. The routes call this. */
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
  };
}
