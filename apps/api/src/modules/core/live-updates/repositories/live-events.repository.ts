import type { Db } from '../../../../kernel/database';

// The SQL that reads a business's newest events from the outbox (`domain_events`). Every query names the business and runs inside its fence.

/** One event as the live stream needs it. */
export interface LiveEventRow {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

/** The business's events of the given kinds that happened after `since`, oldest first (at most `limit`). */
export async function listEventsSince(
  db: Db,
  options: { accountId: string; names: readonly string[]; since: Date; limit: number },
): Promise<LiveEventRow[]> {
  if (options.names.length === 0) return [];
  const rows = await db
    .selectFrom('domain_events')
    .select(['id', 'name', 'payload', 'occurred_at'])
    .where('account_id', '=', options.accountId)
    .where('name', 'in', [...options.names])
    .where('occurred_at', '>', options.since)
    .orderBy('occurred_at')
    .orderBy('id')
    .limit(options.limit)
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, payload: row.payload, occurredAt: row.occurred_at }));
}
