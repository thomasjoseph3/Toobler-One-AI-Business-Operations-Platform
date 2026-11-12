import { MAX_OFFERS } from '@toobler-one/shared';
import type { CreateOfferRequest, Offer } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { isOfferCurrent, todayInTimeZone } from '../helpers/offer-is-current';
import * as offersRepository from '../repositories/offers.repository';
import type { OfferRow } from '../repositories/offers.repository';

/** Turns a database row into the Offer the API answers with. `current` is worked out now, in the business's time zone. */
function toOffer(row: OfferRow, now: Date, timeZone: string): Offer {
  return {
    id: row.id,
    text: row.text,
    endsOn: row.endsOn,
    current: isOfferCurrent(row.endsOn, now, timeZone),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Everything about offers (time-limited promotions) that is not plain reading of the database. The routes call this.
 * Whether an offer is still on is worked out when it is read, in the business's own time zone, never by a job.
 */
export function createOffersService({ database }: { database: Database }) {
  return {
    /**
     * Adds an offer. The last day must be today or later in the business's time zone, otherwise 400 OFFER_ALREADY_ENDED (an offer that
     * has ended is never shown to anyone, so adding one is a mistake). More than MAX_OFFERS live offers answers 409 OFFER_LIMIT.
     * Writes an activity-log line and the `offer.created` event (ids, the end date, never the words). Answers with the new offer.
     */
    async createOffer(
      principal: Pick<Principal, 'accountId' | 'userId' | 'timeZone'>,
      request: CreateOfferRequest,
    ): Promise<Offer> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const now = new Date();
      if (request.endsOn < todayInTimeZone(now, principal.timeZone)) {
        throw new ApiError(400, 'OFFER_ALREADY_ENDED', 'The last day of an offer must be today or later.');
      }
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if ((await offersRepository.countLiveOffers(transaction, accountId)) >= MAX_OFFERS) {
          throw conflict(
            'OFFER_LIMIT',
            `A business can have at most ${MAX_OFFERS} offers. Remove some that have ended.`,
          );
        }
        const offerId = uuidv7();
        await offersRepository.insertOffer(transaction, {
          id: offerId,
          accountId,
          text: request.text,
          endsOn: request.endsOn,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'offers.created',
          // Which fields were filled in, never their values
          details: { recordType: 'offer', recordId: offerId, fields: ['text', 'endsOn'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'offer.created',
          payload: { offerId, endsOn: request.endsOn },
        });
        const saved = await offersRepository.findOfferById(transaction, accountId, offerId);
        if (!saved) throw new Error('The offer that was just saved cannot be read');
        return toOffer(saved, now, principal.timeZone);
      });
    },
  };
}

export type OffersService = ReturnType<typeof createOffersService>;
