import type { Db } from '../db';
import { uuidv7 } from '../ids';
import { EVENT_NAME_PATTERN } from './events';
import { insertOutboxEvent } from './outbox-repository';

const MAX_PAYLOAD_CHARACTERS = 8_000;

/**
 * Saves an event in the outbox. Call it inside the same transaction as the change it announces: if the change is rolled
 * back the event disappears with it, and if the change is saved the event is guaranteed to be delivered later.
 * The business comes from the caller's context (never from input). Returns the new event's id.
 */
export async function publishEvent(
  transaction: Db,
  event: { accountId: string; eventName: string; payload: Record<string, unknown> },
): Promise<string> {
  if (!EVENT_NAME_PATTERN.test(event.eventName)) {
    throw new Error(`Event name "${event.eventName}" must look like "lead.stage_changed" (thing.what_happened).`);
  }
  if (JSON.stringify(event.payload).length > MAX_PAYLOAD_CHARACTERS) {
    throw new Error(`Event "${event.eventName}" has too much data: send ids, not records.`);
  }
  const eventId = uuidv7();
  await insertOutboxEvent(transaction, { id: eventId, accountId: event.accountId, name: event.eventName, payload: event.payload });
  return eventId;
}
