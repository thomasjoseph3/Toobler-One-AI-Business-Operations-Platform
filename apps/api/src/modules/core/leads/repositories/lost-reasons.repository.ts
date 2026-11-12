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
