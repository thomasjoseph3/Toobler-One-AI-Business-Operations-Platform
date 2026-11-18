import type { Db } from '../../../../kernel/database';
import * as activitiesRepository from '../repositories/activities.repository';

/**
 * For each of the given leads, when staff first touched it (earliest note or stage move), or missing if nobody has.
 * Used by the Today module (F22) through this module's index.ts; run it inside the business's own transaction.
 */
export async function findFirstTouchTimesForLeads(
  transaction: Db,
  options: { accountId: string; leadIds: readonly string[] },
): Promise<Map<string, Date>> {
  return activitiesRepository.findFirstTouchTimesForLeads(transaction, options);
}
