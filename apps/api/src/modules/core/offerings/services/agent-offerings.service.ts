import type { Db } from '../../../../kernel/database';
import { selectWhatTheAgentMaySee, type WhatTheAgentMaySee } from '../helpers/what-the-ai-may-see';
import * as offeringsRepository from '../repositories/offerings.repository';
import * as offersRepository from '../repositories/offers.repository';

/**
 * What the AI agent may say about what the business sells right now: the offerings that are on, with their prices in words, and the
 * offers that have not ended (judged in the business's own time zone). The agent reads only this, never the tables, so a switched-off
 * offering or an expired offer cannot reach a customer. Runs inside the caller's transaction, which is already fenced to the business.
 */
export async function findWhatTheAgentMaySee(
  transaction: Db,
  options: { accountId: string; timeZone: string; now: Date },
): Promise<WhatTheAgentMaySee> {
  const offerings = await offeringsRepository.listOfferings(transaction, options.accountId);
  const offers = await offersRepository.listOffers(transaction, options.accountId);
  return selectWhatTheAgentMaySee({
    // The repository already leaves out removed rows, so none of these is "deleted"
    offerings: offerings.map((offering) => ({ ...offering, deleted: false })),
    offers: offers.map((offer) => ({ ...offer, deleted: false })),
    now: options.now,
    timeZone: options.timeZone,
  });
}
