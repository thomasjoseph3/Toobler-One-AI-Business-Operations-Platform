import { sql } from 'kysely';
import type { Db } from '../../../../kernel/database';

// The SQL for reading the `activity_log` table (who did what, when). Lines are only ever added (by `writeActivityLog` in the kernel), never read
// back by anything but this screen. Run every function inside the business's fence.

/** One line as the activity screen shows it, before names are filled in. */
export interface AuditLogRow {
  id: string;
  kind: string;
  actorKind: string;
  actorUserId: string | null;
  recordType: string | null;
  recordId: string | null;
  fields: string[];
  createdAt: Date;
}

/** What the screen can narrow the log by. */
export interface AuditLogFilters {
  personUserId?: string | undefined;
  /** The part of a kind before the dot (`team`, `leads`); a line matches when its kind starts with any of them and a dot. */
  areas?: string[] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/** The lines matching the filters, newest first, one page of them, and how many match in all. */
export async function listAuditLogLines(
  db: Db,
  options: { accountId: string; filters: AuditLogFilters; page: number; limit: number },
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const { accountId, filters } = options;
  let rowsQuery = db
    .selectFrom('activity_log')
    .select(['id', 'kind', 'actor', 'record_type', 'record_id', 'fields', 'created_at'])
    .where('account_id', '=', accountId);
  let countQuery = db
    .selectFrom('activity_log')
    .select(sql<string>`count(*)`.as('total'))
    .where('account_id', '=', accountId);

  if (filters.personUserId) {
    const personFilter = sql<boolean>`actor ->> 'kind' = 'user' and actor ->> 'id' = ${filters.personUserId}`;
    rowsQuery = rowsQuery.where(personFilter);
    countQuery = countQuery.where(personFilter);
  }
  if (filters.areas && filters.areas.length > 0) {
    const areaFilter = sql<boolean>`(${sql.join(
      filters.areas.map((area) => sql`kind like ${`${area.replace(/_/g, '\\_')}.%`}`),
      sql` or `,
    )})`;
    rowsQuery = rowsQuery.where(areaFilter);
    countQuery = countQuery.where(areaFilter);
  }
  if (filters.from) {
    rowsQuery = rowsQuery.where('created_at', '>=', filters.from);
    countQuery = countQuery.where('created_at', '>=', filters.from);
  }
  if (filters.to) {
    rowsQuery = rowsQuery.where('created_at', '<', filters.to);
    countQuery = countQuery.where('created_at', '<', filters.to);
  }

  const rows = await rowsQuery
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(options.limit)
    .offset((options.page - 1) * options.limit)
    .execute();
  const countRow = await countQuery.executeTakeFirstOrThrow();
  return {
    rows: rows.map((row) => {
      const actor = row.actor as { kind?: string; id?: string | null };
      return {
        id: row.id,
        kind: row.kind,
        actorKind: actor.kind ?? 'system',
        actorUserId: actor.kind === 'user' && typeof actor.id === 'string' ? actor.id : null,
        recordType: row.record_type,
        recordId: row.record_id,
        fields: row.fields,
        createdAt: row.created_at,
      };
    }),
    total: Number(countRow.total),
  };
}
