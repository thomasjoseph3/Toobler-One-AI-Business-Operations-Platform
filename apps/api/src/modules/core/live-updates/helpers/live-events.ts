// Which events the live screens hear about, and what is said about each. Pure logic: no database.
// A live message is only the event's kind and the ids it is about: never a name, a phone number or a customer's words.

/** The events a signed-in person's screens hear about. Later features (Today, alerts) add their own names here. */
export const LIVE_EVENT_NAMES: readonly string[] = [
  'conversation.started',
  'conversation.message',
  'conversation.ended',
  'conversation.held',
  'conversation.released',
  'conversation.done',
  'conversation.sorted',
  'conversation.type_corrected',
];

/** The payload keys that carry an id and may be passed on. */
const FORWARDED_ID_KEYS = ['conversationId', 'leadId', 'taskId', 'ticketId'] as const;

/** What the "own leads only" role hears about: nothing from conversations (it cannot read them), so nothing yet. */
export function listEventNamesForRole(role: 'manager' | 'staff' | 'staff_own'): readonly string[] {
  return role === 'staff_own' ? [] : LIVE_EVENT_NAMES;
}

/** The message sent to a screen for one event: its kind and the ids from its payload, and nothing else. */
export function describeLiveEvent(eventName: string, payload: Record<string, unknown>): Record<string, string> {
  const message: Record<string, string> = { event: eventName };
  for (const key of FORWARDED_ID_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && /^[0-9a-f-]{36}$/u.test(value)) message[key] = value;
  }
  return message;
}

/** How far back each read overlaps the last one, so an event whose transaction committed late is not missed (events already sent are skipped by id). */
export const READ_OVERLAP_MILLISECONDS = 10_000;
