import { sql } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL of the activity timeline. Every query names the business and runs inside that business's fence. Only this file touches the
// `activities` table.

/** One activity as the database holds it. */
export interface ActivityRow {
  id: string;
  kind: 'note';
  contactId: string;
  leadId: string | null;
  body: string | null;
  byUserId: string | null;
  byAgent: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

const ACTIVITY_COLUMNS = [
  'id',
  'kind',
  'contact_id',
  'lead_id',
  'body',
  'by_user_id',
  'by_agent',
  'created_at',
  'edited_at',
] as const;

/** Turns a database row into an ActivityRow. */
function toActivityRow(row: {
  id: string;
  kind: 'note';
  contact_id: string;
  lead_id: string | null;
  body: string | null;
  by_user_id: string | null;
  by_agent: string | null;
  created_at: Date;
  edited_at: Date | null;
}): ActivityRow {
  return {
    id: row.id,
    kind: row.kind,
    contactId: row.contact_id,
    leadId: row.lead_id,
    body: row.body,
    byUserId: row.by_user_id,
    byAgent: row.by_agent,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

/** Adds a note (a person's, or an agent's). */
export async function insertNote(
  db: Db,
  options: {
    id: string;
    accountId: string;
    contactId: string;
    leadId: string | null;
    body: string;
    byUserId: string | null;
    byAgent: string | null;
    actor: Actor;
  },
): Promise<ActivityRow> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const row = await db
    .insertInto('activities')
    .values({
      id: options.id,
      account_id: options.accountId,
      contact_id: options.contactId,
      lead_id: options.leadId,
      kind: 'note',
      body: options.body,
      by_user_id: options.byUserId,
      by_agent: options.byAgent,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(ACTIVITY_COLUMNS)
    .executeTakeFirstOrThrow();
  return toActivityRow(row);
}

/**
 * One page of a timeline, newest first (the id breaks ties so every page has the same order), and how many activities match in all.
 * Exactly one of `leadId` and `contactId` narrows it: a lead's own activities, or every activity of a person (all their leads too).
 * Deleted activities are left out.
 */
export async function listActivities(
  db: Db,
  options: {
    accountId: string;
    leadId?: string | undefined;
    contactId?: string | undefined;
    kind?: 'note' | undefined;
    limit: number;
    offset: number;
  },
): Promise<{ items: ActivityRow[]; total: number }> {
  let query = db.selectFrom('activities').where('account_id', '=', options.accountId).where('deleted_at', 'is', null);
  if (options.leadId !== undefined) query = query.where('lead_id', '=', options.leadId);
  if (options.contactId !== undefined) query = query.where('contact_id', '=', options.contactId);
  if (options.kind !== undefined) query = query.where('kind', '=', options.kind);

  const totalRow = await query.select(sql<string>`count(*)`.as('total')).executeTakeFirstOrThrow();
  const rows = await query
    .select(ACTIVITY_COLUMNS)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit)
    .offset(options.offset)
    .execute();
  return { items: rows.map(toActivityRow), total: Number(totalRow.total) };
}
