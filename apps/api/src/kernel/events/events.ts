import type { AccountContext } from '../context';

/** What a subscriber receives. The payload carries ids and small facts, never personal data. */
export interface DomainEvent {
  id: string;
  accountId: string;
  /** `<thing>.<what happened>`, for example `lead.created` or `lead.stage_changed` */
  name: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * A module's reaction to an event. It may run more than once for the same event (delivery is "at least once"), so it
 * must be safe to repeat: use `event.id` to notice work that was already done. It works through `accountContext`, which
 * is fenced to the business the event belongs to.
 */
export type EventHandler = (event: DomainEvent, accountContext: AccountContext) => Promise<void>;

/** A module lists the events it reacts to: event name on the left, handler on the right. */
export type EventHandlers = Record<string, EventHandler>;

/** Event names look like `lead.stage_changed`: lower-case words joined with `_`, one dot. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
