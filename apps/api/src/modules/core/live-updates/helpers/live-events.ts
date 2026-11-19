// Which events the live screens hear about, and what is said about each. Pure logic: no database.
// A live message is only the event's kind and the ids it is about: never a name, a phone number or a customer's words.

/** The conversation events the inbox and live screens hear about (the own-leads-only role cannot read conversations). */
const CONVERSATION_EVENT_NAMES = [
  'conversation.started',
  'conversation.message',
  'conversation.ended',
  'conversation.held',
  'conversation.released',
  'conversation.done',
  'conversation.sorted',
  'conversation.type_corrected',
] as const;

/** The lead and task events the Today page (F22) hears about, so it refreshes when a lead or task changes. */
const LEAD_AND_TASK_EVENT_NAMES = [
  'lead.created',
  'lead.updated',
  'lead.moved',
  'lead.assigned',
  'lead.reopened',
  'lead.reclassified',
  'lead.deleted',
  'task.created',
  'task.updated',
  'task.reassigned',
  'task.deleted',
] as const;

/** Every event a signed-in person's screens may hear about. Later features add their own names here. */
export const LIVE_EVENT_NAMES: readonly string[] = [...CONVERSATION_EVENT_NAMES, ...LEAD_AND_TASK_EVENT_NAMES];

/** The payload keys that carry an id and may be passed on. */
const FORWARDED_ID_KEYS = ['conversationId', 'leadId', 'taskId', 'ticketId'] as const;

/**
 * What a role hears about. The "own leads only" role cannot read conversations, so it hears no conversation events, but
 * it owns leads and tasks, so it still hears about those (ids only) — enough for its own Today page to refresh.
 */
export function listEventNamesForRole(role: 'manager' | 'staff' | 'staff_own'): readonly string[] {
  return role === 'staff_own' ? LEAD_AND_TASK_EVENT_NAMES : LIVE_EVENT_NAMES;
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
