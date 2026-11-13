import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';
import { DEFAULT_LOST_REASONS, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from '../helpers/default-pipeline';
import * as assignmentRulesRepository from '../repositories/assignment-rules.repository';
import * as lostReasonsRepository from '../repositories/lost-reasons.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';

/**
 * Gives a brand-new business what every business starts with: the pipeline (New, Contacted, Quoted, Won, Lost), the five
 * lost reasons, and the rule "every new lead goes to the person who signed up". Call it inside the sign-up transaction, so
 * the business and its pipeline are saved together or not at all. Returns nothing.
 */
export async function createDefaultPipelineSetup(
  transaction: Db,
  options: { accountId: string; ownerUserId: string },
): Promise<void> {
  const actor: Actor = { kind: 'user', id: options.ownerUserId };
  const pipelineId = uuidv7();

  await pipelineRepository.insertPipeline(transaction, {
    id: pipelineId,
    accountId: options.accountId,
    name: DEFAULT_PIPELINE_NAME,
    actor,
  });
  for (const [position, stage] of DEFAULT_STAGES.entries()) {
    await pipelineRepository.insertStage(transaction, {
      id: uuidv7(),
      accountId: options.accountId,
      pipelineId,
      name: stage.name,
      sort: position,
      kind: stage.kind,
      actor,
    });
  }
  for (const [position, label] of DEFAULT_LOST_REASONS.entries()) {
    await lostReasonsRepository.insertLostReason(transaction, {
      id: uuidv7(),
      accountId: options.accountId,
      label,
      sort: position,
      actor,
    });
  }
  await assignmentRulesRepository.insertOnePersonRule(transaction, {
    accountId: options.accountId,
    userId: options.ownerUserId,
    actor,
  });
}
