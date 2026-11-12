import { MAX_OFFERINGS } from '@toobler-one/shared';
import type { CreateOfferingRequest, ListOfferingsQuery, Offering, OfferingsResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { describePriceInWords } from '../helpers/money-in-words';
import * as offeringsRepository from '../repositories/offerings.repository';
import type { OfferingRow } from '../repositories/offerings.repository';

// The database error codes for "a unique rule was broken" and "a foreign key points at nothing".
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** True when the error is the database saying the given kind of rule was broken. */
const isDatabaseError = (error: unknown, code: string) =>
  error instanceof Error && 'code' in error && error.code === code;

/** Turns a database row into the Offering the API answers with, including the price in words. */
function toOffering(row: OfferingRow): Offering {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fromPricePaise: row.fromPricePaise,
    priceUnit: row.priceUnit,
    gstMode: row.gstMode,
    priceInWords: describePriceInWords(row),
    seasonNote: row.seasonNote,
    includes: row.includes,
    details: row.details,
    active: row.active,
    sort: row.sort,
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Everything about offerings that is not plain reading of the database. The routes call this.
 * Offerings are the business's own list (managers write, everyone signed in reads); there is no "own offerings only" filter.
 */
export function createOfferingsService({ database }: { database: Database }) {
  return {
    /** The business's offerings in the owner's order, with the price in words. `active` narrows to the ones that are on or off. */
    async listOfferings(
      principal: Pick<Principal, 'accountId'>,
      query: ListOfferingsQuery,
    ): Promise<OfferingsResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        offeringsRepository.listOfferings(transaction, principal.accountId, {
          active: query.active === undefined ? undefined : query.active === 'true',
        }),
      );
      return { items: rows.map(toOffering) };
    },

    /**
     * Adds an offering at the end of the list, switched on unless sent otherwise. A name that a live offering already has (ignoring
     * capitals) answers 409 OFFERING_EXISTS naming it. More than MAX_OFFERINGS answers 409 OFFERING_LIMIT. An owner from another
     * business answers 404. Two adds at the same moment take turns, so positions never repeat. Writes an activity-log line and the
     * `offering.created` event (ids and field names only). Answers with the new offering.
     */
    async createOffering(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateOfferingRequest,
    ): Promise<Offering> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          await offeringsRepository.lockOfferingsOfBusiness(transaction, accountId);
          if ((await offeringsRepository.countLiveOfferings(transaction, accountId)) >= MAX_OFFERINGS) {
            throw conflict('OFFERING_LIMIT', `A business can have at most ${MAX_OFFERINGS} offerings.`);
          }
          const offeringId = uuidv7();
          await offeringsRepository.insertOffering(transaction, {
            id: offeringId,
            accountId,
            name: request.name,
            description: request.description ?? null,
            fromPricePaise: request.fromPricePaise ?? null,
            priceUnit: request.priceUnit ?? null,
            gstMode: request.gstMode ?? null,
            seasonNote: request.seasonNote ?? null,
            includes: request.includes ?? null,
            details: request.details ?? [],
            active: request.active ?? true,
            sort: await offeringsRepository.nextSortPosition(transaction, accountId),
            ownerUserId: request.ownerUserId ?? null,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'offerings.created',
            // Which fields were filled in, never their values
            details: {
              recordType: 'offering',
              recordId: offeringId,
              fields: Object.keys(request).filter(
                (field) => request[field as keyof CreateOfferingRequest] !== undefined,
              ),
            },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'offering.created',
            payload: { offeringId, active: request.active ?? true },
          });
          const saved = await offeringsRepository.findOfferingById(transaction, accountId, offeringId);
          if (!saved) throw new Error('The offering that was just saved cannot be read');
          return toOffering(saved);
        });
      } catch (error) {
        // The owner is not a person of this business (the database checks the business): answer like any unknown id
        if (isDatabaseError(error, FOREIGN_KEY_VIOLATION)) throw notFound('That person');
        if (!isDatabaseError(error, UNIQUE_VIOLATION)) throw error;
        // Another live offering has this name. The failed transaction is gone, so look in a new one.
        const existing = await database.runInAccountTransaction(accountId, (transaction) =>
          offeringsRepository.findOfferingByName(transaction, accountId, request.name),
        );
        throw conflict(
          'OFFERING_EXISTS',
          'You already have an offering with this name.',
          existing ? { offeringId: existing.id } : undefined,
        );
      }
    },
  };
}

export type OfferingsService = ReturnType<typeof createOfferingsService>;
