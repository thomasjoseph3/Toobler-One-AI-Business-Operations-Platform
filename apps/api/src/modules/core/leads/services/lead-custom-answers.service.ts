import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

/**
 * Adds what the AI heard for the business's custom lead fields to a lead, only for fields it has no answer for yet (staff's answers are never
 * overridden). The caller has already checked the answers. Used by the agents module (through this module's index.ts); run it inside the
 * business's own transaction. Returns whether the lead exists.
 */
export async function addCustomAnswersToLeadWhereEmpty(
  transaction: Db,
  options: { accountId: string; leadId: string; answers: Record<string, unknown>; actor: Actor },
): Promise<boolean> {
  if (Object.keys(options.answers).length === 0) return false;
  return leadsRepository.addCustomAnswersWhereEmpty(transaction, options);
}
