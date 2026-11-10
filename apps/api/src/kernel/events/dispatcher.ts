import type { FastifyBaseLogger } from 'fastify';
import type { ContextFactory } from '../context';
import type { Database } from '../db';
import type { HealthCheck } from '../health';
import type { ModuleGate, Registry } from '../modules/registry';
import type { DomainEvent } from './events';
import { claimDueEvents, markEventDeliveryFailed, markEventDispatched, type ClaimedEvent } from './outbox-repository';

export interface EventDispatcherOptions {
  /** How many events are taken at a time. */
  batchSize: number;
  /** How long an instance may hold an event before another instance may take it over. */
  leaseSeconds: number;
  /** After this many delivery attempts the event is parked as failed. */
  maxAttempts: number;
  /** Wait before the next attempt, given how many attempts were made so far (1, 2, 3...). */
  secondsBeforeRetry: (attemptsSoFar: number) => number;
  /** Pause between checks for new events when nothing is waiting. */
  pollIntervalMilliseconds: number;
  /** /health reports a problem when the loop has not checked for this long. */
  staleAfterMilliseconds: number;
}

const DEFAULT_OPTIONS: EventDispatcherOptions = {
  batchSize: 20,
  leaseSeconds: 60,
  maxAttempts: 8,
  secondsBeforeRetry: (attemptsSoFar) => Math.min(30 * 2 ** (attemptsSoFar - 1), 3600), // 30s, 1m, 2m, 4m ... max 1h
  pollIntervalMilliseconds: 1000,
  staleAfterMilliseconds: 30_000,
};

export interface EventDispatcher {
  /** Delivers every event that is due right now, once. Returns how many events were looked at. Tests call this directly. */
  dispatchPendingEventsOnce(): Promise<number>;
  /** Starts the background loop that keeps delivering events. */
  start(): void;
  /** Stops the loop and waits for the delivery in progress to finish. */
  stop(): Promise<void>;
  /** For /health: fails when the loop is not running or has stopped checking. */
  healthCheck: HealthCheck;
}

/**
 * Delivers events from the outbox to the modules that subscribed to them (`events` in the module manifest).
 * - "At least once": if anything goes wrong the whole event is tried again later with a growing wait, so handlers must
 *   be safe to repeat (that is also why a handler that already succeeded may run again when its sibling failed).
 * - A module that is switched off for the business is skipped; the event is not kept for it. Its data is untouched.
 * - Each handler works through a context fenced to the event's business, never through the system connection.
 */
export function createEventDispatcher(dependencies: {
  database: Database;
  registry: Registry;
  gate: ModuleGate;
  contextFor: ContextFactory;
  logger: FastifyBaseLogger;
  options?: Partial<EventDispatcherOptions>;
}): EventDispatcher {
  const { database, registry, gate, contextFor, logger } = dependencies;
  const options: EventDispatcherOptions = { ...DEFAULT_OPTIONS, ...dependencies.options };

  // Delivers one event to every active subscriber, then marks it done, or schedules a retry, or gives up.
  const deliverEvent = async (claimedEvent: ClaimedEvent): Promise<void> => {
    const event: DomainEvent = {
      id: claimedEvent.id,
      accountId: claimedEvent.accountId,
      name: claimedEvent.name,
      payload: claimedEvent.payload,
      occurredAt: claimedEvent.occurredAt,
    };
    const failedModuleIds: string[] = [];
    let firstErrorMessage = '';

    for (const moduleManifest of registry.modules) {
      const handler = moduleManifest.events?.[event.name];
      if (!handler) continue;
      try {
        if (!(await gate.isActive(event.accountId, moduleManifest.id))) continue;
        await handler(event, contextFor(event.accountId, { kind: 'system', id: moduleManifest.id }));
      } catch (error) {
        failedModuleIds.push(moduleManifest.id);
        firstErrorMessage ||= `${moduleManifest.id}: ${error instanceof Error ? error.message : String(error)}`;
        logger.error({ err: error, eventId: event.id, eventName: event.name, moduleId: moduleManifest.id }, 'event handler failed');
      }
    }

    if (failedModuleIds.length === 0) {
      await markEventDispatched(database.system, event.id);
      return;
    }
    const giveUp = claimedEvent.attempts >= options.maxAttempts;
    await markEventDeliveryFailed(database.system, event.id, {
      errorMessage: firstErrorMessage,
      retryInSeconds: options.secondsBeforeRetry(claimedEvent.attempts),
      giveUp,
    });
    if (giveUp) {
      logger.error({ eventId: event.id, eventName: event.name, attempts: claimedEvent.attempts }, 'event delivery gave up');
    }
  };

  const dispatchPendingEventsOnce = async (): Promise<number> => {
    const claimedEvents = await claimDueEvents(database.system, options.batchSize, options.leaseSeconds);
    for (const claimedEvent of claimedEvents) {
      try {
        await deliverEvent(claimedEvent);
      } catch (error) {
        // Bookkeeping failed (for example the database dropped). The lease will run out and the event comes back.
        logger.error({ err: error, eventId: claimedEvent.id }, 'could not record the result of an event delivery');
      }
    }
    return claimedEvents.length;
  };

  let isRunning = false;
  let lastCheckedAt = 0;
  let loopFinished: Promise<void> = Promise.resolve();
  let wakeUpEarly: (() => void) | undefined;

  // The background loop: deliver what is due; if a full batch was taken go straight on, otherwise wait a moment.
  const runLoop = async (): Promise<void> => {
    while (isRunning) {
      let eventsLookedAt = 0;
      try {
        eventsLookedAt = await dispatchPendingEventsOnce();
        lastCheckedAt = Date.now();
      } catch (error) {
        logger.error({ err: error }, 'event dispatcher could not read the outbox');
      }
      if (eventsLookedAt >= options.batchSize) continue;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, options.pollIntervalMilliseconds);
        wakeUpEarly = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  };

  return {
    dispatchPendingEventsOnce,
    start() {
      if (isRunning) return;
      isRunning = true;
      lastCheckedAt = Date.now();
      loopFinished = runLoop();
    },
    async stop() {
      isRunning = false;
      wakeUpEarly?.();
      await loopFinished;
    },
    healthCheck: {
      name: 'event dispatcher',
      async check() {
        if (!isRunning) throw new Error('not running');
        if (Date.now() - lastCheckedAt > options.staleAfterMilliseconds) throw new Error('stopped checking for events');
      },
    },
  };
}
