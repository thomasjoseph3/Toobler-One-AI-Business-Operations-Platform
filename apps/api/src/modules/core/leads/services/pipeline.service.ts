import type {
  CreateStageRequest,
  Pipeline,
  PipelineStage,
  RemoveStageQuery,
  ReorderStagesRequest,
  UpdateStageRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { MAX_OPEN_STAGES } from '../helpers/default-pipeline';
import * as leadsRepository from '../repositories/leads.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';

// The database error code for "a unique rule was broken" (here: two stages with the same name).
const UNIQUE_VIOLATION = '23505';

/** True when the error is the database saying a unique rule was broken. */
const isUniqueViolation = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION;

/**
 * Everything about a business's pipeline (the columns of the leads board). The routes call this.
 * Repositories used: pipeline (in ../repositories).
 */
export function createPipelineService({ database }: { database: Database }) {
  return {
    /** The business's pipeline with its stages in board order, each with its number of leads (for "own leads only": its own). */
    async getPipeline(principal: Pick<Principal, 'accountId' | 'userId' | 'role'>): Promise<Pipeline> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const pipeline = await pipelineRepository.findPipelineForAccount(transaction, principal.accountId);
        if (!pipeline) throw notFound('The pipeline');
        // The "own leads only" role sees the stages, but the counts only cover the leads it owns
        const stages = await pipelineRepository.listStagesWithLeadCounts(
          transaction,
          principal.accountId,
          pipeline.id,
          principal.role === 'staff_own' ? principal.userId : undefined,
        );
        return { id: pipeline.id, name: pipeline.name, stages };
      });
    },

    /**
     * Adds an open stage just before Won (Won and Lost move one place right, so they stay last). Two stages cannot share
     * a name (capitals ignored): 409 STAGE_EXISTS. A business can have at most MAX_OPEN_STAGES open stages.
     */
    async createStage(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateStageRequest,
    ): Promise<PipelineStage> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const stageExists = () => conflict('STAGE_EXISTS', 'A stage with this name already exists.');

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Lock the pipeline so two managers adding at the same moment take turns
          const pipeline = await pipelineRepository.lockPipelineForAccount(transaction, accountId);
          if (!pipeline) throw notFound('The pipeline');

          const openStageCount = await pipelineRepository.countOpenStages(transaction, accountId, pipeline.id);
          if (openStageCount >= MAX_OPEN_STAGES) {
            throw new ApiError(
              409,
              'TOO_MANY_STAGES',
              `A pipeline can have at most ${MAX_OPEN_STAGES} stages besides Won and Lost.`,
            );
          }
          const wonStageSort = await pipelineRepository.findWonStageSort(transaction, accountId, pipeline.id);
          if (wonStageSort === undefined) throw new Error('The pipeline has no Won stage');

          await pipelineRepository.shiftClosingStagesRight(transaction, { accountId, pipelineId: pipeline.id, actor });
          const stageId = uuidv7();
          await pipelineRepository.insertStage(transaction, {
            id: stageId,
            accountId,
            pipelineId: pipeline.id,
            name: request.name,
            sort: wonStageSort,
            kind: 'open',
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'pipeline.stage_added',
            details: { recordType: 'pipeline_stage', recordId: stageId, fields: ['name'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'pipeline.stage_added',
            payload: { stageId },
          });
          return { id: stageId, name: request.name, kind: 'open' as const, sort: wonStageSort, leadCount: 0 };
        });
      } catch (error) {
        // The database's unique rule on the name is the last word, even if the pre-checks above said fine
        if (isUniqueViolation(error)) throw stageExists();
        throw error;
      }
    },

    /**
     * Renames a stage (any stage, Won and Lost included: the stage keeps its meaning, only the word changes). Another
     * business's stage and an unknown id answer 404. A name another stage already has answers 409 STAGE_EXISTS.
     */
    async renameStage(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      stageId: string,
      request: UpdateStageRequest,
    ): Promise<PipelineStage> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const stage = await pipelineRepository.findStageById(transaction, accountId, stageId);
          if (!stage) throw notFound('That stage');
          await pipelineRepository.renameStage(transaction, { accountId, stageId, name: request.name, actor });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'pipeline.stage_renamed',
            details: { recordType: 'pipeline_stage', recordId: stageId, fields: ['name'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'pipeline.stage_renamed',
            payload: { stageId },
          });
          const stages = await pipelineRepository.listStagesWithLeadCounts(transaction, accountId, stage.pipelineId);
          const renamedStage = stages.find((candidate) => candidate.id === stageId);
          if (!renamedStage) throw new Error('The renamed stage disappeared');
          return renamedStage;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('STAGE_EXISTS', 'A stage with this name already exists.');
        throw error;
      }
    },

    /**
     * Puts the open stages in a new order. The request must list every open stage exactly once and nothing else (no Won or
     * Lost, no other business's stage, no repeats), otherwise 400 STAGES_MISMATCH. Won and Lost stay last. Answers with
     * the whole pipeline in its new order.
     */
    async reorderStages(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: ReorderStagesRequest,
    ): Promise<Pipeline> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Lock the pipeline so a stage added at the same moment cannot slip in between the check and the change
        const pipeline = await pipelineRepository.lockPipelineForAccount(transaction, accountId);
        if (!pipeline) throw notFound('The pipeline');

        const currentOpenStageIds = await pipelineRepository.listOpenStageIds(transaction, accountId, pipeline.id);
        const requestedIds = new Set(request.stageIds);
        const listsEveryOpenStageOnce =
          requestedIds.size === request.stageIds.length &&
          requestedIds.size === currentOpenStageIds.length &&
          currentOpenStageIds.every((stageId) => requestedIds.has(stageId));
        if (!listsEveryOpenStageOnce) {
          throw new ApiError(
            400,
            'STAGES_MISMATCH',
            'List every stage except Won and Lost exactly once. Refresh the board and try again.',
          );
        }

        for (const [position, stageId] of request.stageIds.entries()) {
          await pipelineRepository.setStageSort(transaction, { accountId, stageId, sort: position, actor });
        }
        await pipelineRepository.placeClosingStagesAt(transaction, {
          accountId,
          pipelineId: pipeline.id,
          firstPlace: request.stageIds.length,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'pipeline.stages_reordered',
          details: { recordType: 'pipeline', recordId: pipeline.id, fields: ['sort'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'pipeline.stages_reordered',
          payload: { pipelineId: pipeline.id },
        });
        const stages = await pipelineRepository.listStagesWithLeadCounts(transaction, accountId, pipeline.id);
        return { id: pipeline.id, name: pipeline.name, stages };
      });
    },

    /**
     * Removes an open stage. Its leads move to the open stage named by `move_to`, which is required when the stage has
     * leads (409 STAGE_HAS_LEADS says how many). Refused: Won and Lost (409 CLOSING_STAGE_CANNOT_BE_REMOVED), the last open
     * stage (409 LAST_OPEN_STAGE), and a `move_to` that is the same stage or is Won or Lost (400 INVALID_MOVE_TO). A stage
     * or `move_to` of another business answers 404. The places on the board are renumbered with no gaps. Answers with the
     * whole pipeline.
     */
    async removeStage(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      stageId: string,
      query: RemoveStageQuery,
    ): Promise<Pipeline> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const moveToStageId = query.move_to;

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Lock the pipeline so a lead moved or a stage added at the same moment cannot disturb the removal
        const pipeline = await pipelineRepository.lockPipelineForAccount(transaction, accountId);
        if (!pipeline) throw notFound('The pipeline');

        const stage = await pipelineRepository.findStageById(transaction, accountId, stageId);
        if (!stage) throw notFound('That stage');
        if (stage.kind !== 'open') {
          throw conflict(
            'CLOSING_STAGE_CANNOT_BE_REMOVED',
            'Won and Lost cannot be removed. You can rename them instead.',
          );
        }

        const otherOpenStageIds = await pipelineRepository.listOpenStageIdsExcept(
          transaction,
          accountId,
          pipeline.id,
          stageId,
        );
        if (otherOpenStageIds.length === 0) {
          throw conflict('LAST_OPEN_STAGE', 'A pipeline needs at least one stage besides Won and Lost.');
        }

        // Where the leads go. A stranger's stage answers 404, like any other business's id.
        if (moveToStageId !== undefined) {
          if (moveToStageId === stageId) {
            throw new ApiError(400, 'INVALID_MOVE_TO', 'Choose a different stage to move the leads to.');
          }
          const moveToStage = await pipelineRepository.findStageById(transaction, accountId, moveToStageId);
          if (!moveToStage) throw notFound('The stage to move the leads to');
          if (moveToStage.kind !== 'open') {
            throw new ApiError(400, 'INVALID_MOVE_TO', 'Leads can only be moved to a stage besides Won and Lost.');
          }
        }

        const liveLeadCount = await leadsRepository.countLiveLeadsInStage(transaction, accountId, stageId);
        if (liveLeadCount > 0 && moveToStageId === undefined) {
          throw conflict(
            'STAGE_HAS_LEADS',
            `This stage has ${liveLeadCount} lead${liveLeadCount === 1 ? '' : 's'}. Choose a stage to move them to.`,
            { leadCount: liveLeadCount },
          );
        }

        // Deleted leads still point at their stage, so they move too: to the chosen stage, or (when only deleted leads
        // remain and nothing was chosen) to the first other open stage, where nobody sees them anyway.
        const receivingStageId = moveToStageId ?? otherOpenStageIds[0]!;
        await leadsRepository.moveAllLeadsToStage(transaction, {
          accountId,
          fromStageId: stageId,
          toStageId: receivingStageId,
          actor,
        });
        await pipelineRepository.deleteStage(transaction, accountId, stageId);

        // Close the gap: open stages 0..n-1, then Won, then Lost
        for (const [position, remainingStageId] of otherOpenStageIds.entries()) {
          await pipelineRepository.setStageSort(transaction, {
            accountId,
            stageId: remainingStageId,
            sort: position,
            actor,
          });
        }
        await pipelineRepository.placeClosingStagesAt(transaction, {
          accountId,
          pipelineId: pipeline.id,
          firstPlace: otherOpenStageIds.length,
          actor,
        });

        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'pipeline.stage_removed',
          details: { recordType: 'pipeline_stage', recordId: stageId, fields: ['stage_id'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'pipeline.stage_removed',
          payload: {
            stageId,
            movedLeadCount: liveLeadCount,
            movedToStageId: liveLeadCount > 0 ? receivingStageId : null,
          },
        });

        const stages = await pipelineRepository.listStagesWithLeadCounts(transaction, accountId, pipeline.id);
        return { id: pipeline.id, name: pipeline.name, stages };
      });
    },
  };
}

export type PipelineService = ReturnType<typeof createPipelineService>;
