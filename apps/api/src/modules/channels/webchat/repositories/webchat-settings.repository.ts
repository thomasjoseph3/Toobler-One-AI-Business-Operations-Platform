import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { StoredWebchatSettings } from '../helpers/describe-webchat-settings';

// The SQL for the `webchat_settings` table: one row per business. Every query names the business as well as the row (defence in depth:
// the database also fences every query by business).

/** Turns a database row into the stored settings. */
function toStoredSettings(row: {
  widget_key: string;
  colour: string;
  greeting: string;
  position: 'bottom_right' | 'bottom_left';
  allowed_websites: string[];
  phone_number: string | null;
  whatsapp_number: string | null;
  whatsapp_message: string | null;
  button_order: string[];
  last_seen_website: string | null;
  last_seen_at: Date | null;
}): StoredWebchatSettings {
  return {
    widgetKey: row.widget_key,
    colour: row.colour,
    greeting: row.greeting,
    position: row.position,
    allowedWebsites: row.allowed_websites,
    phoneNumber: row.phone_number,
    whatsappNumber: row.whatsapp_number,
    whatsappMessage: row.whatsapp_message,
    buttonOrder: row.button_order,
    lastSeenWebsite: row.last_seen_website,
    lastSeenAt: row.last_seen_at,
  };
}

/** The business's chat settings, or undefined when they have not been made yet. */
export async function findSettings(db: Db, accountId: string): Promise<StoredWebchatSettings | undefined> {
  const row = await db
    .selectFrom('webchat_settings')
    .selectAll()
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? toStoredSettings(row) : undefined;
}

/**
 * Makes the business's settings with the given key and the ready-chosen defaults, unless they exist already (two first reads at the same
 * moment make one row). Answers true when this call made them.
 */
export async function insertSettingsIfMissing(
  db: Db,
  options: { accountId: string; widgetKey: string; actor: Actor },
): Promise<boolean> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const result = await db
    .insertInto('webchat_settings')
    .values({
      account_id: options.accountId,
      widget_key: options.widgetKey,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) => conflict.column('account_id').doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** What may change. A left-out field stays as it is; `null` clears a number or the message. */
export interface WebchatSettingsChanges {
  colour?: string;
  greeting?: string;
  position?: 'bottom_right' | 'bottom_left';
  allowedWebsites?: string[];
  phoneNumber?: string | null;
  whatsappNumber?: string | null;
  whatsappMessage?: string | null;
  buttonOrder?: string[];
}

/** Changes the named settings of the business. */
export async function updateSettings(
  db: Db,
  options: { accountId: string; changes: WebchatSettingsChanges; actor: Actor },
): Promise<void> {
  const { changes } = options;
  await db
    .updateTable('webchat_settings')
    .set({
      ...(changes.colour !== undefined ? { colour: changes.colour } : {}),
      ...(changes.greeting !== undefined ? { greeting: changes.greeting } : {}),
      ...(changes.position !== undefined ? { position: changes.position } : {}),
      ...(changes.allowedWebsites !== undefined ? { allowed_websites: JSON.stringify(changes.allowedWebsites) } : {}),
      ...(changes.phoneNumber !== undefined ? { phone_number: changes.phoneNumber } : {}),
      ...(changes.whatsappNumber !== undefined ? { whatsapp_number: changes.whatsappNumber } : {}),
      ...(changes.whatsappMessage !== undefined ? { whatsapp_message: changes.whatsappMessage } : {}),
      ...(changes.buttonOrder !== undefined ? { button_order: JSON.stringify(changes.buttonOrder) } : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .execute();
}
