import type {
  ApplyPresetResponse,
  GoLiveResponse,
  KnowledgeQuestion,
  PatchSetupRequest,
  SetupResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { findBusinessLiveAt, markBusinessLive } from '../../auth';
import { hasTriedTheAgent } from '../../conversations';
import { createKnowledgeService } from '../../knowledge';
import { createPipelineService } from '../../leads';
import { findGoLiveBlockers } from '../helpers/go-live-readiness';
import { planStagePreset } from '../helpers/industry-pipeline-presets';
import { computePercentDone, isCheckedBySystem, resolveSetupSteps } from '../helpers/setup-steps';
import * as setupStepsRepository from '../repositories/setup-steps.repository';

/** True when every "needed to go live" question in "About your business" (section B) has a confirmed answer. */
function isAboutBusinessAnswered(questions: readonly KnowledgeQuestion[]): boolean {
  return questions
    .filter((question) => question.section === 'B' && question.neededToGoLive)
    .every((question) => question.answer?.status === 'confirmed');
}

type SetupPrincipal = Pick<Principal, 'accountId' | 'userId' | 'industryId' | 'role'>;

/**
 * The setup wizard's progress: which steps are done, what still stops the business going live, the industry's words for the pipeline, and
 * going live. The routes call this. The steps are code; the database only holds what the owner marked.
 */
export function createSetupService({ database }: { database: Database }) {
  const knowledgeService = createKnowledgeService({ database });
  const pipelineService = createPipelineService({ database });

  /** Reads the whole setup picture for the business. */
  async function readSetup(principal: Pick<Principal, 'accountId' | 'industryId'>): Promise<SetupResponse> {
    const { questions, progress } = await knowledgeService.listQuestions(principal);
    const { markedByOwner, triedTheAgent, liveAt } = await database.runInAccountTransaction(
      principal.accountId,
      async (transaction) => ({
        markedByOwner: await setupStepsRepository.listMarkedSteps(transaction, principal.accountId),
        triedTheAgent: await hasTriedTheAgent(transaction, principal.accountId),
        liveAt: await findBusinessLiveAt(transaction, principal.accountId),
      }),
    );
    const offeringsQuestion = questions.find((question) => question.key === 'offerings');
    const steps = resolveSetupSteps(markedByOwner, {
      aboutBusinessAnswered: isAboutBusinessAnswered(questions),
      hasOfferingSwitchedOn: offeringsQuestion?.elsewhereStatus === 'done',
      hasTriedTheAgent: triedTheAgent,
    });
    const blockers = findGoLiveBlockers({
      neededQuestionsStillMissing: progress.neededToGoLiveStillMissing,
      promisesStepDone: markedByOwner.get('promises') === 'done',
      hasTriedTheAgent: triedTheAgent,
    });
    return {
      steps,
      percentDone: computePercentDone(steps),
      neededToGoLiveStillMissing: progress.neededToGoLiveStillMissing,
      blockers,
      readyToGoLive: blockers.length === 0,
      isLive: liveAt !== null,
      liveAt: liveAt?.toISOString() ?? null,
    };
  }

  return {
    /** The steps with their status, the percent done, what still stops the business going live, and whether it is live. */
    getSetup: readSetup,

    /**
     * Marks one step done, skipped or todo. A step the system checks itself answers 400 STEP_CHECKED_BY_SYSTEM. Marking a step
     * the way it already is changes nothing and writes no log line. Answers with the whole setup picture.
     */
    async markStep(principal: SetupPrincipal, request: PatchSetupRequest): Promise<SetupResponse> {
      if (isCheckedBySystem(request.step)) {
        throw new ApiError(
          400,
          'STEP_CHECKED_BY_SYSTEM',
          'This step is finished by answering its questions, so it cannot be marked by hand.',
        );
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const currentStatus =
          (await setupStepsRepository.lockMarkedStep(transaction, accountId, request.step)) ?? 'todo';
        if (currentStatus === request.status) return;
        await setupStepsRepository.saveMarkedStep(transaction, {
          accountId,
          stepKey: request.step,
          status: request.status,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'setup.step_marked',
          // Which step, and how it was marked: both are codes, never free words
          details: { recordType: 'setup_step', fields: [request.step, request.status] },
        });
      });
      return readSetup(principal);
    },

    /**
     * Gives the leads board the words of the business's kind of business (a hotel says "Called" and "Rate sent"). Only a stage that still
     * has the standard word is renamed; a stage the owner changed is never touched, and nothing is added or removed. Applying it again
     * changes nothing. The "pipeline" step is marked done (applying the words is accepting them).
     */
    async applyPreset(principal: SetupPrincipal): Promise<ApplyPresetResponse> {
      const accountId = principal.accountId;
      const pipeline = await pipelineService.getPipeline(principal);
      const openStages = pipeline.stages.filter((stage) => stage.kind === 'open');
      const plan = planStagePreset(principal.industryId, openStages);

      for (const rename of plan.rename) {
        await pipelineService.renameStage(principal, rename.stageId, { name: rename.to });
      }

      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const currentStatus = (await setupStepsRepository.lockMarkedStep(transaction, accountId, 'pipeline')) ?? 'todo';
        if (currentStatus !== 'done') {
          await setupStepsRepository.saveMarkedStep(transaction, {
            accountId,
            stepKey: 'pipeline',
            status: 'done',
            actor,
          });
        }
        if (plan.rename.length > 0) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'setup.preset_applied',
            // The industry's id and how many stages changed; never the owner's own words
            details: { recordType: 'pipeline', fields: [principal.industryId, String(plan.rename.length)] },
          });
        }
      });
      return {
        industry: principal.industryId,
        renamedStages: plan.rename.map((rename) => ({ from: rename.from, to: rename.to })),
        leftAloneStages: plan.leftAlone,
      };
    },

    /**
     * Starts the business answering real customers. Refused with 409 NOT_READY (and the list of what is missing) until every "needed to
     * go live" question is confirmed, the "How fast will you call back" step is done and the agent has answered once in "Test the agent".
     * Going live twice changes nothing: the first moment is kept. Answers with that moment.
     */
    async goLive(principal: SetupPrincipal): Promise<GoLiveResponse> {
      const setup = await readSetup(principal);
      if (setup.liveAt) return { liveAt: setup.liveAt };
      if (!setup.readyToGoLive) {
        throw new ApiError(409, 'NOT_READY', 'Finish the steps below before going live.', { blockers: setup.blockers });
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const liveAt = await database.runInAccountTransaction(accountId, async (transaction) => {
        const wentLiveAt = await markBusinessLive(transaction, accountId, actor);
        if (wentLiveAt === null) return (await findBusinessLiveAt(transaction, accountId))!; // two managers pressed it together
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'setup.went_live',
          details: { recordType: 'business', recordId: accountId },
        });
        await publishEvent(transaction, { accountId, eventName: 'business.went_live', payload: {} });
        return wentLiveAt;
      });
      return { liveAt: liveAt.toISOString() };
    },
  };
}

export type SetupService = ReturnType<typeof createSetupService>;
