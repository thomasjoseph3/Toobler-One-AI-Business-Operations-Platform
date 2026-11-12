import { sql } from 'kysely';
import type { LostReason } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `lost_reasons` table (the reasons the Lost dialog offers). More functions arrive with their routes.

/** Adds one lost reason. */
export async function insertLostReason(
  db: Db,
  lostReason: { id: string; accountId: string; label: string; sort: number; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: lostReason.actor.kind, id: lostReason.actor.id };
  await db
    .insertInto('lost_reasons')
    .values({
      id: lostReason.id,
      account_id: lostReason.accountId,
      label: lostReason.label,
      sort: lostReason.sort,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** All the business's lost reasons, in the order the Lost dialog shows them. */
export async function listLostReasons(db: Db, accountId: string): Promise<LostReason[]> {
  const rows = await db
    .selectFrom('lost_reasons')
    .select(['id', 'label', 'sort'])
    .where('account_id', '=', accountId)
    .orderBy('sort')
    .execute();
  return rows.map((row) => ({ id: row.id, label: row.label, sort: row.sort }));
}

/** Removes all the business's lost reasons (a lead keeps the words it was lost with, so nothing else points at them). */
export async function deleteAllLostReasons(db: Db, accountId: string): Promise<void> {
  await db.deleteFrom('lost_reasons').where('account_id', '=', accountId).execute();
}

/** The business's lost reason that matches this text when capitals are ignored, as it is stored; undefined if none matches. */
export async function findLostReasonLabel(db: Db, accountId: string, text: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('lost_reasons')
    .select('label')
    .where('account_id', '=', accountId)
    .where(sql<string>`lower(label)`, '=', text.toLowerCase())
    .executeTakeFirst();
  return row?.label;
}
