import type { LostReasonsResponse, ReplaceLostReasonsRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as lostReasonsRepository from '../repositories/lost-reasons.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';

/**
 * Everything about the reasons offered when a lead is lost. The routes call this.
 * Repositories used: lost-reasons and pipeline (in ../repositories).
 */
export function createLostReasonsService({ database }: { database: Database }) {
  return {
    /** The business's lost reasons in the order the Lost dialog shows them. */
    async listLostReasons(principal: Pick<Principal, 'accountId'>): Promise<LostReasonsResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => ({
        items: await lostReasonsRepository.listLostReasons(transaction, principal.accountId),
      }));
    },

    /**
     * Replaces the whole list with the labels sent, in that order. Two labels that match when capitals are ignored answer
     * 400 DUPLICATE_LOST_REASON. A lead keeps the words it was lost with, so old leads are not affected by a rename or a
     * removal. Answers with the new list.
     */
    async replaceLostReasons(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: ReplaceLostReasonsRequest,
    ): Promise<LostReasonsResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      const labelsInLowerCase = new Set(request.reasons.map((label) => label.toLowerCase()));
      if (labelsInLowerCase.size !== request.reasons.length) {
        throw new ApiError(400, 'DUPLICATE_LOST_REASON', 'Each reason can appear only once.');
      }

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Replacing is "delete all, then add": two managers saving at the same moment must take turns, or their lists
        // would merge. The business's pipeline row is the lock every settings change of this module takes.
        const pipeline = await pipelineRepository.lockPipelineForAccount(transaction, accountId);
        if (!pipeline) throw notFound('The pipeline');

        await lostReasonsRepository.deleteAllLostReasons(transaction, accountId);
        for (const [position, label] of request.reasons.entries()) {
          await lostReasonsRepository.insertLostReason(transaction, {
            id: uuidv7(),
            accountId,
            label,
            sort: position,
            actor,
          });
        }
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'lost_reasons.replaced',
          details: { recordType: 'lost_reasons', fields: ['reasons'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'lost_reasons.replaced',
          payload: { count: request.reasons.length },
        });
        return { items: await lostReasonsRepository.listLostReasons(transaction, accountId) };
      });
    },
  };
}

export type LostReasonsService = ReturnType<typeof createLostReasonsService>;
