import type { Db } from '../../../../kernel/database';
import * as accountsRepository from '../repositories/accounts.repository';
import * as usersRepository from '../repositories/users.repository';

// Small read-only facts about a business that other modules need and that this module owns (the business and its people).
// Other modules reach these only through this module's index.ts.

/** The kind of business this is (an id from the industries list, like `hotel_resort`), or undefined when the business does not exist. */
export async function findBusinessIndustry(transaction: Db, accountId: string): Promise<string | undefined> {
  const account = await accountsRepository.findAccountById(transaction, accountId);
  return account?.industry;
}

/**
 * The phone numbers (digits only) and emails of the business's own people, as sets. A conversation that comes from one of these is
 * the team's own, not a customer. Runs in the business's own transaction.
 */
export async function findStaffContactPoints(
  transaction: Db,
  accountId: string,
): Promise<{ phoneKeys: ReadonlySet<string>; emails: ReadonlySet<string> }> {
  const points = await usersRepository.listStaffContactPoints(transaction, accountId);
  return { phoneKeys: new Set(points.phoneKeys), emails: new Set(points.emails) };
}
