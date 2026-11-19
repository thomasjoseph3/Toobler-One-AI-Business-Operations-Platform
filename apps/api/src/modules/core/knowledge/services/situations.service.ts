import type { PutSituationRequest, Situation, SituationsResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { resolveAllSituations, resolveSituation } from '../helpers/situation-choices';
import { findSituation } from '../helpers/situations';
import * as situationsRepository from '../repositories/situations.repository';

/**
 * How the business wants common moments handled (a discount request, being full, a complaint...). The routes call this.
 * The seven situations and their choices are code; the business's own choices are the only thing stored.
 */
export function createSituationsService({ database }: { database: Database }) {
  return {
    /** The seven situations with the business's choices (the ready-picked default where it has not chosen). */
    async listSituations(principal: Pick<Principal, 'accountId'>): Promise<SituationsResponse> {
      const saved = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        situationsRepository.listSavedChoices(transaction, principal.accountId),
      );
      return { items: resolveAllSituations(saved) };
    },

    /**
     * Chooses how one situation is handled. An unknown situation answers 404. A fixed situation (complaint, exact price,
     * unknown answer) answers 400 SITUATION_FIXED. A choice that is not one of that situation's own answers 400
     * INVALID_CHOICE. Choosing the way that already applies changes nothing and writes no log line. Answers with the situation.
     */
    async chooseHandling(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      situationKey: string,
      request: PutSituationRequest,
    ): Promise<Situation> {
      const definition = findSituation(situationKey);
      if (!definition) throw notFound('That situation');
      if (definition.fixed) {
        throw new ApiError(
          400,
          'SITUATION_FIXED',
          'This is handled the same way for every business and cannot be changed.',
        );
      }
      if (!definition.choices.some((choice) => choice.key === request.choice)) {
        throw new ApiError(
          400,
          'INVALID_CHOICE',
          `Pick one of: ${definition.choices.map((choice) => choice.key).join(', ')}.`,
        );
      }

      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await situationsRepository.lockSavedChoice(transaction, accountId, situationKey);
        const effectiveNow = resolveSituation(definition, current);
        if (effectiveNow.selectedChoiceKey !== request.choice) {
          await situationsRepository.saveChoice(transaction, {
            accountId,
            situationKey,
            choice: request.choice,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'knowledge.situation_changed',
            // Which situation changed; the choice is a code, never free words
            details: { recordType: 'situation', fields: [situationKey] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'knowledge.situation_changed',
            payload: { situationKey, choice: request.choice },
          });
        }
        const saved = await situationsRepository.lockSavedChoice(transaction, accountId, situationKey);
        return resolveSituation(definition, saved);
      });
    },
  };
}

export type SituationsService = ReturnType<typeof createSituationsService>;
