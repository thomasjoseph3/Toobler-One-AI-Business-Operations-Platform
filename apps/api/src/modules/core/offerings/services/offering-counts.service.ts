import type { Db } from '../../../../kernel/database';
import * as offeringsRepository from '../repositories/offerings.repository';

/**
 * How many offerings the business has switched on. The business profile (knowledge module) uses this, through this module's
 * index.ts, to know whether "What do you sell?" is answered: a business needs at least one offering that is on to go live.
 * Runs inside the caller's transaction, which is already fenced to the business.
 */
export async function countActiveOfferingsOfBusiness(transaction: Db, accountId: string): Promise<number> {
  return offeringsRepository.countActiveOfferings(transaction, accountId);
}
