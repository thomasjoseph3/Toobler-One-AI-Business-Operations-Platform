import { MAX_OFFERINGS } from '@toobler-one/shared';
import type {
  CreateOfferingRequest,
  ListOfferingsQuery,
  Offering,
  OfferingsResponse,
  ReorderOfferingsRequest,
  UpdateOfferingRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { describePriceInWords } from '../helpers/money-in-words';
import * as offeringsRepository from '../repositories/offerings.repository';
import type { OfferingChanges, OfferingRow } from '../repositories/offerings.repository';

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

/** The details as a short comparable text, so "the same list sent again" is recognised. */
const detailsAsText = (details: Array<{ label: string; value: string }>) =>
  JSON.stringify(details.map((detail) => [detail.label, detail.value]));

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

    /**
     * Changes an offering. Only the fields that really change are written; sending the values it already has changes nothing and
     * writes no log line. `fromPricePaise: null` takes the whole price away; any other change must leave a price complete (a price,
     * its unit and its GST note, or none of the three), otherwise 400 INCOMPLETE_PRICE. A name another live offering has answers 409
     * OFFERING_EXISTS; an unknown, removed or other business's offering, and an owner from another business, answer 404. Switching
     * `active` on or off is a change like any other. Answers with the offering.
     */
    async updateOffering(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      offeringId: string,
      request: UpdateOfferingRequest,
    ): Promise<Offering> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one field to change.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Two people changing one offering at the same moment take turns
          if (!(await offeringsRepository.lockOfferingForUpdate(transaction, accountId, offeringId))) {
            throw notFound('That offering');
          }
          const current = await offeringsRepository.findOfferingById(transaction, accountId, offeringId);
          if (!current) throw notFound('That offering');

          // What the offering would look like: a field not sent stays as it is, `null` clears it
          const changes: OfferingChanges = {};
          if (request.name !== undefined && request.name !== current.name) changes.name = request.name;
          if (request.description !== undefined && request.description !== current.description)
            changes.description = request.description;
          if (request.seasonNote !== undefined && request.seasonNote !== current.seasonNote)
            changes.seasonNote = request.seasonNote;
          if (request.includes !== undefined && request.includes !== current.includes)
            changes.includes = request.includes;
          if (request.active !== undefined && request.active !== current.active) changes.active = request.active;
          if (request.ownerUserId !== undefined && request.ownerUserId !== current.ownerUserId)
            changes.ownerUserId = request.ownerUserId;
          if (request.details !== undefined && detailsAsText(request.details) !== detailsAsText(current.details)) {
            changes.details = request.details;
          }

          // The price: null takes all three away, otherwise the three must stay together
          let price = {
            fromPricePaise: current.fromPricePaise,
            priceUnit: current.priceUnit,
            gstMode: current.gstMode,
          };
          if (request.fromPricePaise === null) {
            if ((request.priceUnit ?? null) !== null || (request.gstMode ?? null) !== null) {
              throw new ApiError(400, 'INCOMPLETE_PRICE', 'To take the price away, send only fromPricePaise: null.');
            }
            price = { fromPricePaise: null, priceUnit: null, gstMode: null };
          } else {
            if (request.fromPricePaise !== undefined) price.fromPricePaise = request.fromPricePaise;
            if (request.priceUnit !== undefined) price.priceUnit = request.priceUnit;
            if (request.gstMode !== undefined) price.gstMode = request.gstMode;
          }
          const given = [price.fromPricePaise, price.priceUnit, price.gstMode].filter((value) => value !== null);
          if (given.length !== 0 && given.length !== 3) {
            throw new ApiError(
              400,
              'INCOMPLETE_PRICE',
              'A price needs its unit (per night...) and its GST note (included, plus or none).',
            );
          }
          if (price.fromPricePaise !== current.fromPricePaise) changes.fromPricePaise = price.fromPricePaise;
          if (price.priceUnit !== current.priceUnit) changes.priceUnit = price.priceUnit;
          if (price.gstMode !== current.gstMode) changes.gstMode = price.gstMode;

          const changedFields = Object.keys(changes); // the names of the fields that really change
          if (changedFields.length > 0) {
            await offeringsRepository.updateOffering(transaction, { accountId, offeringId, changes, actor });
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'offerings.updated',
              // Which fields changed, never their values
              details: { recordType: 'offering', recordId: offeringId, fields: changedFields },
            });
            await publishEvent(transaction, {
              accountId,
              eventName: 'offering.updated',
              payload: { offeringId, fields: changedFields },
            });
          }
          const saved = await offeringsRepository.findOfferingById(transaction, accountId, offeringId);
          if (!saved) throw new Error('The offering that was just changed cannot be read');
          return toOffering(saved);
        });
      } catch (error) {
        if (isDatabaseError(error, FOREIGN_KEY_VIOLATION)) throw notFound('That person');
        if (!isDatabaseError(error, UNIQUE_VIOLATION)) throw error;
        const name = request.name ?? '';
        const existing = await database.runInAccountTransaction(accountId, (transaction) =>
          offeringsRepository.findOfferingByName(transaction, accountId, name),
        );
        throw conflict(
          'OFFERING_EXISTS',
          'You already have an offering with this name.',
          existing ? { offeringId: existing.id } : undefined,
        );
      }
    },

    /**
     * Puts the offerings in a new order. The request must list every live offering of the business (on and off) exactly once and
     * nothing else (no removed offering, no other business's, no repeats), otherwise 400 OFFERINGS_MISMATCH. Positions become 0, 1, 2...
     * with no gaps. Sending the order it already has changes nothing and writes no log line. Answers with the list in its new order.
     */
    async reorderOfferings(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: ReorderOfferingsRequest,
    ): Promise<OfferingsResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Reordering works out positions from what is there, so it takes its turn with adding
        await offeringsRepository.lockOfferingsOfBusiness(transaction, accountId);
        const currentIds = await offeringsRepository.listLiveOfferingIdsInOrder(transaction, accountId);
        const requestedIds = new Set(request.offeringIds);
        const listsEveryOfferingOnce =
          requestedIds.size === request.offeringIds.length &&
          requestedIds.size === currentIds.length &&
          currentIds.every((offeringId) => requestedIds.has(offeringId));
        if (!listsEveryOfferingOnce) {
          throw new ApiError(
            400,
            'OFFERINGS_MISMATCH',
            'List every offering of the business exactly once, and nothing else.',
            { expected: currentIds.length, received: request.offeringIds.length },
          );
        }
        const alreadyInThatOrder = currentIds.every((offeringId, index) => request.offeringIds[index] === offeringId);
        const positionsAlreadyTidy = (await offeringsRepository.listOfferings(transaction, accountId)).every(
          (offering, index) => offering.sort === index,
        );
        if (!(alreadyInThatOrder && positionsAlreadyTidy)) {
          await offeringsRepository.setPositions(transaction, {
            accountId,
            positions: request.offeringIds.map((offeringId, index) => ({ offeringId, sort: index })),
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'offerings.reordered',
            details: { recordType: 'offering', fields: ['order'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'offerings.reordered',
            payload: { count: request.offeringIds.length },
          });
        }
        return { items: (await offeringsRepository.listOfferings(transaction, accountId)).map(toOffering) };
      });
    },

    /**
     * Removes an offering from view: a soft delete, the row stays because a lead may point at it. The name is free to use again. An
     * unknown id, a removed one and another business's offering answer 404. Writes an activity-log line and the `offering.deleted` event.
     */
    async deleteOffering(principal: Pick<Principal, 'accountId' | 'userId'>, offeringId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await offeringsRepository.lockOfferingForUpdate(transaction, accountId, offeringId))) {
          throw notFound('That offering');
        }
        await offeringsRepository.softDeleteOffering(transaction, { accountId, offeringId, actor, now: new Date() });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'offerings.deleted',
          details: { recordType: 'offering', recordId: offeringId },
        });
        await publishEvent(transaction, { accountId, eventName: 'offering.deleted', payload: { offeringId } });
      });
    },
  };
}

export type OfferingsService = ReturnType<typeof createOfferingsService>;
