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

/** A person to send an email to: their name and confirmed address. Used only to send; never logged or put in an event. */
export interface PersonToEmail {
  id: string;
  name: string;
  email: string;
}

/** The people among these ids who have a confirmed email address (the tasks module's reminder goes to the task's owner). Run it inside the business's own transaction. */
export async function findPeopleToEmail(
  transaction: Db,
  options: { accountId: string; userIds: string[] },
): Promise<PersonToEmail[]> {
  return usersRepository.listPeopleToEmailByIds(transaction, options.accountId, [...new Set(options.userIds)]);
}

/** The business's managers who have a confirmed email address (the tasks module's late alert goes to them). Run it inside the business's own transaction. */
export async function findManagersToEmail(transaction: Db, options: { accountId: string }): Promise<PersonToEmail[]> {
  return usersRepository.listManagersToEmail(transaction, options.accountId);
}
