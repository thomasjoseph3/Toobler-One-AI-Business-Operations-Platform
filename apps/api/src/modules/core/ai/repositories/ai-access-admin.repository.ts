import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL a PLATFORM ADMIN needs to see and change a business's platform AI access. These queries name the business they are about
// and run on the owner connection (the admin works across businesses), never in a business's fence. Only the platform-only
// routes reach this file.

/** The business's name, or undefined when there is no such business. */
export async function findBusinessName(db: Db, businessId: string): Promise<string | undefined> {
  const row = await db.selectFrom('accounts').select('name').where('id', '=', businessId).executeTakeFirst();
  return row?.name;
}

/** How many live keys of its own the business has saved. */
export async function countOwnKeys(db: Db, businessId: string): Promise<number> {
  const row = await db
    .selectFrom('ai_keys')
    .select((expressionBuilder) => expressionBuilder.fn.countAll<string>().as('total'))
    .where('account_id', '=', businessId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The platform's part of a business's AI settings. A field left out (undefined) is not changed; null clears a cap or an end date. */
export interface PlatformSettingsChange {
  enabled?: boolean | undefined;
  monthlyCallCap?: number | null | undefined;
  expiresAt?: Date | null | undefined;
  noticesEnabled?: boolean | undefined;
}

/** Saves the platform's part of the business's settings, creating the row if the business has none. */
export async function savePlatformSettings(
  db: Db,
  options: { businessId: string; change: PlatformSettingsChange; actor: Actor },
): Promise<void> {
  const { change } = options;
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const columns = {
    ...(change.enabled !== undefined ? { platform_enabled: change.enabled } : {}),
    ...(change.monthlyCallCap !== undefined ? { platform_monthly_call_cap: change.monthlyCallCap } : {}),
    ...(change.expiresAt !== undefined ? { platform_expires_at: change.expiresAt } : {}),
    ...(change.noticesEnabled !== undefined ? { notices_enabled: change.noticesEnabled } : {}),
  };
  await db
    .insertInto('ai_settings')
    .values({ account_id: options.businessId, ...columns, created_by: actorStamp, updated_by: actorStamp })
    .onConflict((conflict) => conflict.column('account_id').doUpdateSet({ ...columns, updated_by: actorStamp }))
    .execute();
}
