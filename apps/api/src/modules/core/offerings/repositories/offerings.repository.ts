import { sql } from 'kysely';
import type { GstMode, OfferingDetail } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `offerings` table. Every query names the business as well as the id (defence in depth: the database also
// fences every query by business). Removed offerings (deleted_at set) are left out of every read here.

/** An offering as the database holds it. The service turns it into the API's Offering. */
export interface OfferingRow {
  id: string;
  name: string;
  description: string | null;
  fromPricePaise: number | null;
  priceUnit: string | null;
  gstMode: GstMode | null;
  seasonNote: string | null;
  includes: string | null;
  details: OfferingDetail[];
  active: boolean;
  sort: number;
  ownerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a database row of `offerings` into an OfferingRow. */
function toOfferingRow(row: {
  id: string;
  name: string;
  description: string | null;
  from_price_paise: number | null;
  price_unit: string | null;
  gst_mode: GstMode | null;
  season_note: string | null;
  includes: string | null;
  details: unknown;
  active: boolean;
  sort: number;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}): OfferingRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fromPricePaise: row.from_price_paise,
    priceUnit: row.price_unit,
    gstMode: row.gst_mode,
    seasonNote: row.season_note,
    includes: row.includes,
    details: row.details as OfferingDetail[],
    active: row.active,
    sort: row.sort,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Makes the business's other changes to its offerings wait their turn until the end of this transaction. Adding and
 * reordering work out positions from what is there, so two at the same moment must not both read the same list.
 */
export async function lockOfferingsOfBusiness(db: Db, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`offerings:${accountId}`}))`.execute(db);
}

/** How many live (not removed) offerings the business has. */
export async function countLiveOfferings(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('offerings')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The position a new offering takes: one after the last. */
export async function nextSortPosition(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('offerings')
    .select((expression) => expression.fn.max<number>('sort').as('highest'))
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.highest === null || row?.highest === undefined ? 0 : Number(row.highest) + 1;
}

/** Adds an offering. Fails with a unique error when a live offering has the same name, and a foreign-key error when the owner does not work for the business. */
export async function insertOffering(
  db: Db,
  offering: {
    id: string;
    accountId: string;
    name: string;
    description: string | null;
    fromPricePaise: number | null;
    priceUnit: string | null;
    gstMode: GstMode | null;
    seasonNote: string | null;
    includes: string | null;
    details: OfferingDetail[];
    active: boolean;
    sort: number;
    ownerUserId: string | null;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: offering.actor.kind, id: offering.actor.id };
  await db
    .insertInto('offerings')
    .values({
      id: offering.id,
      account_id: offering.accountId,
      name: offering.name,
      description: offering.description,
      from_price_paise: offering.fromPricePaise,
      price_unit: offering.priceUnit,
      gst_mode: offering.gstMode,
      season_note: offering.seasonNote,
      includes: offering.includes,
      details: JSON.stringify(offering.details),
      active: offering.active,
      sort: offering.sort,
      owner_user_id: offering.ownerUserId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** The business's live offerings in the owner's order, optionally only the ones that are on (or off). */
export async function listOfferings(
  db: Db,
  accountId: string,
  options: { active?: boolean | undefined } = {},
): Promise<OfferingRow[]> {
  let query = db
    .selectFrom('offerings')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null);
  if (options.active !== undefined) query = query.where('active', '=', options.active);
  const rows = await query.orderBy('sort', 'asc').orderBy('id', 'asc').execute();
  return rows.map(toOfferingRow);
}

/** One live offering of the business, or undefined when the id is unknown, removed, or another business's. */
export async function findOfferingById(
  db: Db,
  accountId: string,
  offeringId: string,
): Promise<OfferingRow | undefined> {
  const row = await db
    .selectFrom('offerings')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', offeringId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toOfferingRow(row) : undefined;
}

/** The business's live offering with this name (ignoring capitals), or undefined. */
export async function findOfferingByName(db: Db, accountId: string, name: string): Promise<OfferingRow | undefined> {
  const row = await db
    .selectFrom('offerings')
    .selectAll()
    .where('account_id', '=', accountId)
    .where(sql<boolean>`lower(name) = lower(${name})`)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toOfferingRow(row) : undefined;
}
