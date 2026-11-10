import type { Db } from './database';
import type { Actor } from './context';
import { uuidv7 } from './ids';

/** Optional facts about a logged action. `fields` are the NAMES of fields that changed, never their values. */
export interface ActivityDetails {
  recordType?: string;
  recordId?: string;
  fields?: string[];
  ip?: string;
  userAgent?: string;
}

/** Adds one line to the activity log (the append-only "who did what, when" record). Call inside the change's transaction. */
export async function writeActivityLog(
  transaction: Db,
  entry: { accountId: string; actor: Actor; kind: string; details?: ActivityDetails | undefined },
): Promise<void> {
  const details = entry.details ?? {};
  await transaction
    .insertInto('activity_log')
    .values({
      id: uuidv7(),
      account_id: entry.accountId,
      actor: { kind: entry.actor.kind, id: entry.actor.id },
      kind: entry.kind,
      record_type: details.recordType ?? null,
      record_id: details.recordId ?? null,
      fields: details.fields ?? [],
      ip: details.ip ?? null,
      user_agent: details.userAgent ?? null,
    })
    .execute();
}
