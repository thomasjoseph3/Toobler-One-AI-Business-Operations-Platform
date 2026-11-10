import { sql } from 'kysely';
import type { Db } from '../database';

/** An event row as the dispatcher reads it after claiming it. */
export interface ClaimedEvent {
  id: string;
  accountId: string;
  name: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  /** How many times delivery has been started, including this one. */
  attempts: number;
}

/** Adds an event to the outbox. Runs inside the publisher's own (fenced) transaction. */
export async function insertOutboxEvent(
  transaction: Db,
  event: { id: string; accountId: string; name: string; payload: Record<string, unknown> },
): Promise<void> {
  await transaction
    .insertInto('domain_events')
    .values({
      id: event.id,
      account_id: event.accountId,
      name: event.name,
      payload: event.payload,
      dispatched_at: null,
      locked_until: null,
      last_error: null,
      failed_at: null,
    })
    .execute();
}

/**
 * Takes up to `limit` events that are due and not being delivered by anyone else, and "leases" them for
 * `leaseSeconds`. Several app instances can run this at once: `FOR UPDATE SKIP LOCKED` makes each one take different
 * events, and a lease that runs out (the instance crashed) lets another instance take the event over.
 * The attempt counter goes up when delivery STARTS, so an event that crashes the process still reaches its attempt limit.
 * Runs on the system connection, because events of every business are read together.
 */
export async function claimDueEvents(systemDb: Db, limit: number, leaseSeconds: number): Promise<ClaimedEvent[]> {
  const result = await sql<{
    id: string;
    account_id: string;
    name: string;
    payload: Record<string, unknown>;
    occurred_at: Date;
    attempts: number;
  }>`
    update domain_events
    set locked_until = now() + ${leaseSeconds} * interval '1 second', attempts = attempts + 1
    where id in (
      select id from domain_events
      where dispatched_at is null and failed_at is null
        and next_attempt_at <= now()
        and (locked_until is null or locked_until < now())
      order by occurred_at
      limit ${limit}
      for update skip locked
    )
    returning id, account_id, name, payload, occurred_at, attempts
  `.execute(systemDb);
  return result.rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    payload: row.payload,
    occurredAt: row.occurred_at,
    attempts: row.attempts,
  }));
}

/** Marks an event as delivered to everyone who wanted it. */
export async function markEventDispatched(systemDb: Db, eventId: string): Promise<void> {
  await systemDb
    .updateTable('domain_events')
    .set({ dispatched_at: sql`now()`, locked_until: null, last_error: null })
    .where('id', '=', eventId)
    .execute();
}

/**
 * Records a failed delivery. With `retryInSeconds` the event is tried again after that wait; with `giveUp` it is parked
 * as failed (and stays in the table for someone to look at). Only the short error message is kept, never the
 * database's detail text, which can contain a customer's phone number or email.
 */
export async function markEventDeliveryFailed(
  systemDb: Db,
  eventId: string,
  failure: { errorMessage: string; retryInSeconds: number; giveUp: boolean },
): Promise<void> {
  await systemDb
    .updateTable('domain_events')
    .set({
      last_error: failure.errorMessage.slice(0, 300),
      locked_until: null,
      next_attempt_at: sql`now() + ${failure.retryInSeconds} * interval '1 second'`,
      failed_at: failure.giveUp ? sql`now()` : null,
    })
    .where('id', '=', eventId)
    .execute();
}
