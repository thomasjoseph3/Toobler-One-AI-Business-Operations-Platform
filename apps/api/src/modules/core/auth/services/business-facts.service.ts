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

/** What the AI agent needs to know about the business itself: its name, its kind and the time zone its hours are in. */
export interface BusinessIdentity {
  name: string;
  industry: string;
  timeZone: string;
  /** How many minutes the business promises to call back within while it is open. */
  callbackPromiseMinutes: number;
}

/** The business's name, kind of business, time zone and callback promise, or undefined when the business does not exist. Runs in the business's own transaction. */
export async function findBusinessIdentity(transaction: Db, accountId: string): Promise<BusinessIdentity | undefined> {
  const account = await accountsRepository.findAccountById(transaction, accountId);
  return account
    ? {
        name: account.name,
        industry: account.industry,
        timeZone: account.timeZone,
        callbackPromiseMinutes: account.callbackPromiseMinutes,
      }
    : undefined;
}

/** When the business went live (started answering real customers), or null when it has not yet. Runs in the business's own transaction. */
export async function findBusinessLiveAt(transaction: Db, accountId: string): Promise<Date | null> {
  return (await accountsRepository.findLiveAt(transaction, accountId)) ?? null;
}

/**
 * Marks the business live. Only the setup wizard's "Go live" calls this, after it has checked the business is ready. Returns the moment it
 * went live, or null when it already was (the first moment is kept).
 */
export async function markBusinessLive(
  transaction: Db,
  accountId: string,
  actor: { kind: string; id: string | null },
): Promise<Date | null> {
  return accountsRepository.markLive(transaction, accountId, actor);
}
