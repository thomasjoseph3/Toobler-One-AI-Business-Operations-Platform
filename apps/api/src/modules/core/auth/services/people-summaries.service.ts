import type { Db } from '../../../../kernel/database';
import * as usersRepository from '../repositories/users.repository';

/** The few facts about a person that another module shows next to its own records (who wrote a note). */
export interface PersonSummary {
  id: string;
  name: string;
  role: 'manager' | 'staff' | 'staff_own';
}

/**
 * The people of the business among these ids, as short summaries. An unknown id and a person of another business are simply missing
 * from the answer. Used by the notes module (through this module's index.ts) to show who wrote a note. Run it inside the business's own transaction.
 */
export async function findPeopleSummaries(
  transaction: Db,
  options: { accountId: string; userIds: string[] },
): Promise<PersonSummary[]> {
  return usersRepository.listPeopleByIds(transaction, options.accountId, [...new Set(options.userIds)]);
}
