import {
  makeFieldKey,
  MAX_FIELDS_PER_OBJECT,
  tidyOptions,
  type CreateFieldRequest,
  type FieldDefinition,
  type FieldsListResponse,
  type ListFieldsQuery,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { conflict } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as fieldDefinitionsRepository from '../repositories/field-definitions.repository';

// The database error code for "a unique rule was broken" (two fields with one key, made at the same moment).
const UNIQUE_VIOLATION = '23505';

/**
 * Everything about a business's custom fields. The routes call this.
 * Repositories used: field-definitions (in ../repositories).
 */
export function createFieldsService({ database }: { database: Database }) {
  return {
    /** The business's fields in the order to show them: one object's (contact, company or lead), or all three objects' when none is named. */
    async listFields(principal: Pick<Principal, 'accountId'>, query: ListFieldsQuery): Promise<FieldsListResponse> {
      const items = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        fieldDefinitionsRepository.listFieldDefinitions(transaction, principal.accountId, query.object),
      );
      return { items };
    },

    /**
     * Adds a field to the end of its object's fields. The key is made from the label ("Car model" gives `car_model`; a second "Car model" gives
     * `car_model_2`) and never changes. An object can have at most 50 live fields (409 FIELD_LIMIT). Choices are tidied (blanks and repeats dropped).
     */
    async createField(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateFieldRequest,
    ): Promise<FieldDefinition> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const options = request.type === 'dropdown' ? tidyOptions(request.options ?? []) : [];
      const fieldId = uuidv7();
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const { liveCount, highestSort } = await fieldDefinitionsRepository.describeObjectFields(
            transaction,
            accountId,
            request.object,
          );
          if (liveCount >= MAX_FIELDS_PER_OBJECT) {
            throw conflict(
              'FIELD_LIMIT',
              `You can have at most ${MAX_FIELDS_PER_OBJECT} fields here. Remove one you do not use first.`,
            );
          }
          // A key is never reused, even by a removed field: "car_model", then "car_model_2", and so on
          const baseKey = makeFieldKey(request.label);
          let key = baseKey;
          for (
            let attempt = 2;
            await fieldDefinitionsRepository.keyIsTaken(transaction, accountId, request.object, key);
            attempt += 1
          ) {
            key = `${baseKey.slice(0, 55)}_${attempt}`;
          }
          const field = await fieldDefinitionsRepository.insertFieldDefinition(transaction, {
            id: fieldId,
            accountId,
            object: request.object,
            key,
            label: request.label,
            type: request.type,
            options,
            aiAsks: request.aiAsks,
            requiredForWon: request.requiredForWon,
            sort: highestSort + 1,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'fields.created',
            details: { recordType: 'field', recordId: fieldId },
          });
          return field;
        });
      } catch (error) {
        // Two fields with one label at the same moment: the database's unique rule decides, and the loser is told to try again
        if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
          throw conflict('FIELD_KEY_TAKEN', 'Another field was added at the same moment. Please try again.');
        }
        throw error;
      }
    },
  };
}

export type FieldsService = ReturnType<typeof createFieldsService>;
