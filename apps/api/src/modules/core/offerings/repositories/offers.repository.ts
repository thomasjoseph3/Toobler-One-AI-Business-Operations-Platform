import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `offers` table (time-limited promotions). Every query names the business as well as the id (defence in depth:
// the database also fences every query by business). Removed offers (deleted_at set) are left out of every read here.

/** An offer as the database holds it. `endsOn` is a plain date like 2026-12-31. */
export interface OfferRow {
  id: string;
  text: string;
  endsOn: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a database row of `offers` into an OfferRow. */
function toOfferRow(row: { id: string; text: string; ends_on: string; created_at: Date; updated_at: Date }): OfferRow {
  return { id: row.id, text: row.text, endsOn: row.ends_on, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** How many live (not removed) offers the business has, expired ones included. */
export async function countLiveOffers(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('offers')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** Adds an offer. */
export async function insertOffer(
  db: Db,
  offer: { id: string; accountId: string; text: string; endsOn: string; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: offer.actor.kind, id: offer.actor.id };
  await db
    .insertInto('offers')
    .values({
      id: offer.id,
      account_id: offer.accountId,
      text: offer.text,
      ends_on: offer.endsOn,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One live offer of the business, or undefined when the id is unknown, removed, or another business's. */
export async function findOfferById(db: Db, accountId: string, offerId: string): Promise<OfferRow | undefined> {
  const row = await db
    .selectFrom('offers')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', offerId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toOfferRow(row) : undefined;
}
