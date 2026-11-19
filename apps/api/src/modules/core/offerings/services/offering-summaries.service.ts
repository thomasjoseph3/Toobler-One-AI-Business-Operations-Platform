import type { Db } from '../../../../kernel/database';
import * as offeringsRepository from '../repositories/offerings.repository';

/** What another module may know about an offering. */
export interface OfferingSummary {
  id: string;
  name: string;
  /** The person who looks after it (new leads about it can go to them), or null. */
  ownerUserId: string | null;
  /** True once the offering was removed; it still exists for the history of the leads that point at it. */
  removed: boolean;
}

/**
 * The business's offerings with these ids, as short summaries, removed ones included. An unknown id and another business's offering
 * are simply missing from the answer. The leads module uses this (through this module's index.ts) to show which offering a lead is
 * about. Runs inside the caller's transaction, which is already fenced to the business.
 */
export async function findOfferingSummaries(
  transaction: Db,
  options: { accountId: string; offeringIds: string[] },
): Promise<OfferingSummary[]> {
  return offeringsRepository.findOfferingSummariesByIds(transaction, options.accountId, options.offeringIds);
}

/**
 * One offering a lead may be about: it must exist for this business and not be removed (a switched-off offering is fine). Undefined
 * otherwise, which the caller answers as 404.
 */
export async function findOfferingForLead(
  transaction: Db,
  options: { accountId: string; offeringId: string },
): Promise<OfferingSummary | undefined> {
  const [summary] = await findOfferingSummaries(transaction, {
    accountId: options.accountId,
    offeringIds: [options.offeringId],
  });
  return summary && !summary.removed ? summary : undefined;
}
