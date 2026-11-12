import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { SavedSituationChoice } from '../helpers/situation-choices';

// The SQL for the `situations` table (one row per business and situation, only once the business has chosen). Every query
// names the business as well as the situation (defence in depth: the database also fences every query by business).

/** All the choices the business has saved. */
export async function listSavedChoices(db: Db, accountId: string): Promise<SavedSituationChoice[]> {
  const rows = await db
    .selectFrom('situations')
    .select(['situation_key', 'choice', 'updated_at'])
    .where('account_id', '=', accountId)
    .execute();
  return rows.map((row) => ({ situationKey: row.situation_key, choice: row.choice, updatedAt: row.updated_at }));
}

/**
 * Locks the business's saved choice for one situation until the end of the transaction, and returns it. Two managers
 * changing the same situation at the same moment take turns. Undefined when the business has not chosen yet.
 */
export async function lockSavedChoice(
  db: Db,
  accountId: string,
  situationKey: string,
): Promise<SavedSituationChoice | undefined> {
  const row = await db
    .selectFrom('situations')
    .select(['situation_key', 'choice', 'updated_at'])
    .where('account_id', '=', accountId)
    .where('situation_key', '=', situationKey)
    .forUpdate()
    .executeTakeFirst();
  return row ? { situationKey: row.situation_key, choice: row.choice, updatedAt: row.updated_at } : undefined;
}

/** Saves the business's choice for one situation: adds it, or replaces the earlier one. */
export async function saveChoice(
  db: Db,
  options: { accountId: string; situationKey: string; choice: string; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('situations')
    .values({
      account_id: options.accountId,
      situation_key: options.situationKey,
      choice: options.choice,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'situation_key']).doUpdateSet({ choice: options.choice, updated_by: actorStamp }),
    )
    .execute();
}
