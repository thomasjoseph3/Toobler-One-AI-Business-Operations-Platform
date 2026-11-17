import { sql, type SqlBool } from 'kysely';
import type { TaskBucket, TaskKind } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL of tasks. Every query names the business and runs inside that business's fence. Only this file touches the `tasks` table.

/** One task as the database holds it. */
export interface TaskRow {
  id: string;
  kind: TaskKind;
  title: string;
  dueAt: Date;
  doneAt: Date | null;
  contactId: string;
  leadId: string | null;
  ownerUserId: string;
  createdByAgent: string | null;
  createdAt: Date;
}

const TASK_COLUMNS = [
  'id',
  'kind',
  'title',
  'due_at',
  'done_at',
  'contact_id',
  'lead_id',
  'owner_user_id',
  'created_by_agent',
  'created_at',
] as const;

/** Turns a database row into a TaskRow. */
function toTaskRow(row: {
  id: string;
  kind: TaskKind;
  title: string;
  due_at: Date;
  done_at: Date | null;
  contact_id: string;
  lead_id: string | null;
  owner_user_id: string;
  created_by_agent: string | null;
  created_at: Date;
}): TaskRow {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    dueAt: row.due_at,
    doneAt: row.done_at,
    contactId: row.contact_id,
    leadId: row.lead_id,
    ownerUserId: row.owner_user_id,
    createdByAgent: row.created_by_agent,
    createdAt: row.created_at,
  };
}

/** Adds a task made by a person, or by an agent (then `createdByAgent` is set). */
export async function insertTask(
  db: Db,
  options: {
    id: string;
    accountId: string;
    contactId: string;
    leadId: string | null;
    kind: TaskKind;
    title: string;
    dueAt: Date;
    ownerUserId: string;
    createdByAgent: string | null;
    actor: Actor;
  },
): Promise<TaskRow> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const row = await db
    .insertInto('tasks')
    .values({
      id: options.id,
      account_id: options.accountId,
      contact_id: options.contactId,
      lead_id: options.leadId,
      kind: options.kind,
      title: options.title,
      due_at: options.dueAt,
      owner_user_id: options.ownerUserId,
      created_by_agent: options.createdByAgent,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(TASK_COLUMNS)
    .executeTakeFirstOrThrow();
  return toTaskRow(row);
}

/** The test that puts a task in a tab at `now` (the same rule as `bucketOfTask`, written for the database). */
function bucketCondition(bucket: TaskBucket, now: Date, startOfTomorrow: Date) {
  switch (bucket) {
    case 'done':
      return sql<SqlBool>`done_at IS NOT NULL`;
    case 'overdue':
      return sql<SqlBool>`done_at IS NULL AND due_at < ${now}`;
    case 'today':
      return sql<SqlBool>`done_at IS NULL AND due_at >= ${now} AND due_at < ${startOfTomorrow}`;
    case 'upcoming':
      return sql<SqlBool>`done_at IS NULL AND due_at >= ${startOfTomorrow}`;
  }
}

/**
 * One page of tasks and how many tasks each tab holds for the same filters. `bucket` picks the tab (nothing means every open task).
 * Open tasks come soonest first, done ones most recently finished first. `contactId` includes all of that person's leads. Deleted tasks are
 * left out.
 */
export async function listTasks(
  db: Db,
  options: {
    accountId: string;
    ownerUserId?: string | undefined;
    leadId?: string | undefined;
    contactId?: string | undefined;
    bucket?: TaskBucket | undefined;
    now: Date;
    startOfTomorrow: Date;
    limit: number;
    offset: number;
  },
): Promise<{ items: TaskRow[]; total: number; counts: Record<TaskBucket, number> }> {
  let filtered = db.selectFrom('tasks').where('account_id', '=', options.accountId).where('deleted_at', 'is', null);
  if (options.ownerUserId !== undefined) filtered = filtered.where('owner_user_id', '=', options.ownerUserId);
  if (options.leadId !== undefined) filtered = filtered.where('lead_id', '=', options.leadId);
  if (options.contactId !== undefined) filtered = filtered.where('contact_id', '=', options.contactId);

  // The four tab numbers in one query
  const countsRow = await filtered
    .select([
      sql<string>`count(*) FILTER (WHERE ${bucketCondition('overdue', options.now, options.startOfTomorrow)})`.as(
        'overdue',
      ),
      sql<string>`count(*) FILTER (WHERE ${bucketCondition('today', options.now, options.startOfTomorrow)})`.as(
        'today',
      ),
      sql<string>`count(*) FILTER (WHERE ${bucketCondition('upcoming', options.now, options.startOfTomorrow)})`.as(
        'upcoming',
      ),
      sql<string>`count(*) FILTER (WHERE ${bucketCondition('done', options.now, options.startOfTomorrow)})`.as('done'),
    ])
    .executeTakeFirstOrThrow();
  const counts = {
    overdue: Number(countsRow.overdue),
    today: Number(countsRow.today),
    upcoming: Number(countsRow.upcoming),
    done: Number(countsRow.done),
  };

  const chosen = options.bucket !== undefined ? options.bucket : 'open';
  const pageQuery =
    chosen === 'open'
      ? filtered.where(sql<SqlBool>`done_at IS NULL`)
      : filtered.where(bucketCondition(chosen, options.now, options.startOfTomorrow));
  const total = chosen === 'open' ? counts.overdue + counts.today + counts.upcoming : counts[chosen];
  const orderedQuery =
    chosen === 'done'
      ? pageQuery.orderBy('done_at', 'desc').orderBy('id', 'desc')
      : pageQuery.orderBy('due_at', 'asc').orderBy('id', 'asc');
  const rows = await orderedQuery.select(TASK_COLUMNS).limit(options.limit).offset(options.offset).execute();
  return { items: rows.map(toTaskRow), total, counts };
}
