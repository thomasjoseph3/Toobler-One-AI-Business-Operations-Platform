import type {
  AddPlatformAiModelRequest,
  PlatformAiModel,
  PlatformAiModelsResponse,
  PlatformTaskModels,
  UpdatePlatformAiModelRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { AI_TASK_IDS } from '../helpers/ai-tasks';
import { findProblemsInTaskModels } from '../helpers/check-task-models';
import type { CatalogueModel } from '../helpers/choose-models-for-task';
import { findModelOrderPerTask } from '../repositories/ai-models.repository';
import * as adminRepository from '../repositories/ai-models-admin.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a catalogue model into what a platform admin sees. */
function toPlatformModel(model: CatalogueModel): PlatformAiModel {
  return {
    id: model.id,
    provider: model.provider,
    modelName: model.modelName,
    label: model.label,
    tasks: model.tasks,
    status: model.status,
    kind: model.kind,
    size: model.size,
    isAlias: model.isAlias,
    retiresOn: model.retiresOn,
    sortOrder: model.sortOrder,
  };
}

/** The ids in `jobIds` that are not jobs the AI does. */
function unknownJobs(jobIds: string[]): string[] {
  return jobIds.filter((jobId) => !AI_TASK_IDS.includes(jobId));
}

/**
 * What the Toobler team does with the list of AI models and each job's order: look at them, add a model, change one (mark it
 * deprecated or retired, set the date the AI company retires it, say which jobs it suits) and set the order of models for a job.
 * Only platform admins reach this (the route's guard checks). The tables are shared by every business, so it runs on the owner
 * connection. Each change is written to the activity log of the admin's own business (field names only).
 */
export function createPlatformAiModelsService({ database }: { database: Database }) {
  /** Writes the activity-log line for a change to the shared model list, under the admin's own business. */
  async function logChange(
    transaction: Parameters<Parameters<Database['runInSystemTransaction']>[0]>[0],
    admin: Pick<Principal, 'accountId' | 'userId'>,
    kind: string,
    recordId: string | undefined,
    fields: string[],
  ) {
    const actor: Actor = { kind: 'user', id: admin.userId };
    await writeActivityLog(transaction, {
      accountId: admin.accountId,
      actor,
      kind,
      details: { recordType: 'ai_model', ...(recordId ? { recordId } : {}), fields },
    });
  }

  return {
    /** Every model in the list and the platform's model order for each job. */
    async listModels(): Promise<PlatformAiModelsResponse> {
      const models = await adminRepository.findAllModelsForAdmin(database.system);
      const orderPerTask = await findModelOrderPerTask(database.system);
      return { models: models.map(toPlatformModel), taskModels: Object.fromEntries(orderPerTask) };
    },

    /**
     * Adds a model to the list. A model name the company already has answers 409 AI_MODEL_EXISTS; a job id that is not a job answers
     * 400 UNKNOWN_JOBS. It is not in any job's order until the admin puts it there.
     */
    async addModel(
      admin: Pick<Principal, 'accountId' | 'userId'>,
      request: AddPlatformAiModelRequest,
    ): Promise<PlatformAiModel> {
      const badJobs = unknownJobs(request.tasks);
      if (badJobs.length > 0) throw new ApiError(400, 'UNKNOWN_JOBS', `Not jobs the AI does: ${badJobs.join(', ')}`);
      try {
        return await database.runInSystemTransaction(async (transaction) => {
          const modelId = await adminRepository.insertModel(transaction, request);
          await logChange(transaction, admin, 'platform.ai_model_added', modelId, ['provider', 'modelName', 'label']);
          const saved = await adminRepository.findModelById(transaction, modelId);
          if (!saved) throw new Error('The model that was just added cannot be read');
          return toPlatformModel(saved);
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
          throw conflict('AI_MODEL_EXISTS', `${request.provider} already has a model called ${request.modelName}.`);
        }
        throw error;
      }
    },

    /**
     * Changes a model. Only the fields sent change; sending nothing answers 400 NOTHING_TO_CHANGE, an unknown job 400 UNKNOWN_JOBS,
     * an unknown model 404. Marking a model retired takes it out of every job at once (nobody is sent to it); the business's saved
     * orders keep the id but it is skipped.
     */
    async updateModel(
      admin: Pick<Principal, 'accountId' | 'userId'>,
      modelId: string,
      request: UpdatePlatformAiModelRequest,
    ): Promise<PlatformAiModel> {
      const changedFields = Object.entries(request)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field);
      if (changedFields.length === 0) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one field to change.');
      }
      const badJobs = unknownJobs(request.tasks ?? []);
      if (badJobs.length > 0) throw new ApiError(400, 'UNKNOWN_JOBS', `Not jobs the AI does: ${badJobs.join(', ')}`);
      return database.runInSystemTransaction(async (transaction) => {
        const found = await adminRepository.updateModel(transaction, modelId, request);
        if (!found) throw notFound('That model');
        await logChange(transaction, admin, 'platform.ai_model_changed', modelId, changedFields);
        const saved = await adminRepository.findModelById(transaction, modelId);
        if (!saved) throw notFound('That model');
        return toPlatformModel(saved);
      });
    },

    /**
     * Sets the platform's model order for one job, replacing the old order (best first). An unknown job answers 404; an unknown,
     * retired or voice model, or a model listed twice, answers 400 INVALID_TASK_MODELS naming each problem. Businesses that set their
     * own order for the job keep it; every other business follows the new one.
     */
    async setTaskModels(
      admin: Pick<Principal, 'accountId' | 'userId'>,
      taskId: string,
      modelIds: string[],
    ): Promise<PlatformTaskModels> {
      if (!AI_TASK_IDS.includes(taskId)) throw notFound('That job');
      return database.runInSystemTransaction(async (transaction) => {
        const catalogue = await adminRepository.findAllModelsForAdmin(transaction);
        const problems = findProblemsInTaskModels(catalogue, { [taskId]: modelIds });
        if (problems.length > 0) {
          throw new ApiError(400, 'INVALID_TASK_MODELS', 'Some of the chosen models cannot be used.', { problems });
        }
        await adminRepository.replaceTaskModels(transaction, taskId, modelIds);
        await logChange(transaction, admin, 'platform.ai_task_models_set', undefined, [taskId]);
        return { taskId, modelIds };
      });
    },
  };
}
