import { sql } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { ActivityKind } from '@toobler-one/shared';

// The SQL of the activity timeline. Every query names the business and runs inside that business's fence. Only this file touches the
// `activities` table.

/** One activity as the database holds it. */
export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  contactId: string;
  leadId: string | null;
  body: string | null;
  details: Record<string, unknown> | null;
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
  'details',
  'by_user_id',
  'by_agent',
  'created_at',
  'edited_at',
] as const;

/** Turns a database row into an ActivityRow. */
function toActivityRow(row: {
  id: string;
  kind: ActivityKind;
  contact_id: string;
  lead_id: string | null;
  body: string | null;
  details: unknown;
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
    details: (row.details as Record<string, unknown> | null) ?? null,
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
    kind?: ActivityKind | undefined;
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

/** What the service needs to decide whether a note may be changed: its lead, who wrote it, and its words. */
export interface NoteForChange {
  id: string;
  leadId: string | null;
  byUserId: string | null;
  body: string | null;
}

/**
 * Locks one live note of the business (so two changes at the same moment take turns) and gives what is needed to decide. Undefined for an
 * unknown id, a deleted note, another business's note, or an activity that is not a note.
 */
export async function lockNoteForChange(db: Db, accountId: string, noteId: string): Promise<NoteForChange | undefined> {
  const row = await db
    .selectFrom('activities')
    .select(['id', 'lead_id', 'by_user_id', 'body'])
    .where('account_id', '=', accountId)
    .where('id', '=', noteId)
    .where('kind', '=', 'note')
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  return row ? { id: row.id, leadId: row.lead_id, byUserId: row.by_user_id, body: row.body } : undefined;
}

/** Changes a note's words and marks it edited now. Returns the note as it is after the change. */
export async function updateNoteBody(
  db: Db,
  options: { accountId: string; noteId: string; body: string; actor: Actor },
): Promise<ActivityRow> {
  const row = await db
    .updateTable('activities')
    .set({
      body: options.body,
      edited_at: new Date(),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.noteId)
    .returning(ACTIVITY_COLUMNS)
    .executeTakeFirstOrThrow();
  return toActivityRow(row);
}

/** Deletes a note the soft way: it disappears from every timeline, its row is kept. */
export async function softDeleteNote(
  db: Db,
  options: { accountId: string; noteId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('activities')
    .set({ deleted_at: new Date(), updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.noteId)
    .execute();
}

/** One live note of the business with all its columns, or undefined. */
export async function findNoteById(db: Db, accountId: string, noteId: string): Promise<ActivityRow | undefined> {
  const row = await db
    .selectFrom('activities')
    .select(ACTIVITY_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', noteId)
    .where('kind', '=', 'note')
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? toActivityRow(row) : undefined;
}

/** How many live notes each of these leads has (a lead with none is missing from the answer). */
export async function countNotesByLead(db: Db, accountId: string, leadIds: string[]): Promise<Map<string, number>> {
  if (leadIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('activities')
    .select(['lead_id', sql<string>`count(*)`.as('total')])
    .where('account_id', '=', accountId)
    .where('kind', '=', 'note')
    .where('deleted_at', 'is', null)
    .where('lead_id', 'in', leadIds)
    .groupBy('lead_id')
    .execute();
  return new Map(rows.flatMap((row) => (row.lead_id === null ? [] : [[row.lead_id, Number(row.total)] as const])));
}

/**
 * Adds a line the system writes by itself (a lead was added, a lead moved to another stage). `sourceEventId` is the event that caused it:
 * if that event is delivered a second time the line is already there and nothing is written. Returns true when a line was added.
 */
export async function insertSystemLine(
  db: Db,
  options: {
    id: string;
    accountId: string;
    contactId: string;
    leadId: string;
    kind: 'lead_created' | 'stage_changed';
    details: Record<string, string>;
    byUserId: string | null;
    byAgent: string | null;
    sourceEventId: string;
    actor: Actor;
  },
): Promise<boolean> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const inserted = await db
    .insertInto('activities')
    .values({
      id: options.id,
      account_id: options.accountId,
      contact_id: options.contactId,
      lead_id: options.leadId,
      kind: options.kind,
      details: options.details,
      by_user_id: options.byUserId,
      by_agent: options.byAgent,
      source_event_id: options.sourceEventId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) =>
      conflict.columns(['account_id', 'source_event_id']).where('source_event_id', 'is not', null).doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  return inserted !== undefined;
}
