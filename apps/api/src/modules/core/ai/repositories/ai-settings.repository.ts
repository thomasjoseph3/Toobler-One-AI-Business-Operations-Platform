import type { AiKeyMode, TaskModels } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `ai_settings` table (one row per business). The manager's columns (key mode, own model order) and the platform's
// columns (platform keys on or off, cap, end date, notices) are written by different people; the database only lets business code
// write the manager's. A business with no row yet simply has the defaults.

/** A business's settings as the database holds them. */
export interface AiSettingsRow {
  keyMode: AiKeyMode;
  taskModels: TaskModels;
  platformEnabled: boolean;
  platformMonthlyCallCap: number | null;
  platformExpiresAt: Date | null;
  noticesEnabled: boolean;
}

/** What a business has before anyone has saved a setting: its own keys only, and no platform access. */
export const DEFAULT_AI_SETTINGS: AiSettingsRow = {
  keyMode: 'own',
  taskModels: {},
  platformEnabled: false,
  platformMonthlyCallCap: null,
  platformExpiresAt: null,
  noticesEnabled: true,
};

/** The business's settings, or the defaults when it has none yet. */
export async function findSettings(db: Db, accountId: string): Promise<AiSettingsRow> {
  const row = await db.selectFrom('ai_settings').selectAll().where('account_id', '=', accountId).executeTakeFirst();
  if (!row) return DEFAULT_AI_SETTINGS;
  return {
    keyMode: row.key_mode,
    taskModels: row.task_models as TaskModels,
    platformEnabled: row.platform_enabled,
    platformMonthlyCallCap: row.platform_monthly_call_cap,
    platformExpiresAt: row.platform_expires_at,
    noticesEnabled: row.notices_enabled,
  };
}

/**
 * Saves the manager's settings: creates the row if the business has none, otherwise changes only the fields given. The platform's
 * columns are never touched here (and the database would refuse).
 */
export async function saveManagerSettings(
  db: Db,
  options: { accountId: string; keyMode?: AiKeyMode | undefined; taskModels?: TaskModels | undefined; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const changes = {
    ...(options.keyMode !== undefined ? { key_mode: options.keyMode } : {}),
    ...(options.taskModels !== undefined ? { task_models: options.taskModels } : {}),
  };
  await db
    .insertInto('ai_settings')
    .values({ account_id: options.accountId, ...changes, created_by: actorStamp, updated_by: actorStamp })
    .onConflict((conflict) => conflict.column('account_id').doUpdateSet({ ...changes, updated_by: actorStamp }))
    .execute();
}
