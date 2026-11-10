import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createContextFactory, type AccountContext } from '../src/kernel/context';
import type { Database } from '../src/kernel/db';
import { createEventDispatcher, type EventDispatcherOptions } from '../src/kernel/events/dispatcher';
import type { DomainEvent } from '../src/kernel/events/events';
import { claimDueEvents } from '../src/kernel/events/outbox-repository';
import { publishEvent } from '../src/kernel/events/publish';
import { defineModule } from '../src/kernel/modules/define';
import { createRegistry, type ModuleGate } from '../src/kernel/modules/registry';
import { newAccountId, openTestDatabase, waitFor } from './support/harness';

let database: Database;
beforeAll(() => {
  database = openTestDatabase();
});
afterAll(() => database.close());
beforeEach(async () => {
  await database.system.deleteFrom('domain_events').execute();
  await database.system.deleteFrom('activity_log').execute();
});

const silentLogger = pino({ level: 'silent' });
const contextFor = () => createContextFactory(database);
const everythingOn: ModuleGate = { isActive: async () => true };

/** Saves one event for a business the way a real service would: inside that business's fenced transaction. */
const publishFor = (accountId: string, eventName: string, payload: Record<string, unknown> = {}) =>
  database.runInAccountTransaction(accountId, (transaction) =>
    publishEvent(transaction, { accountId, eventName, payload }),
  );

/** A dispatcher over test modules; waits and limits are set so tests never sleep. */
function dispatcherFor(
  testModules: ReturnType<typeof defineModule>[],
  gate: ModuleGate = everythingOn,
  options: Partial<EventDispatcherOptions> = {},
) {
  return createEventDispatcher({
    database,
    registry: createRegistry(testModules),
    gate,
    contextFor: contextFor(),
    logger: silentLogger,
    options: { secondsBeforeRetry: () => 0, ...options },
  });
}

const readEventRow = (eventId: string) =>
  database.system.selectFrom('domain_events').selectAll().where('id', '=', eventId).executeTakeFirstOrThrow();

describe('publishing events', () => {
  it('is saved together with the change: a rolled-back transaction leaves no event', async () => {
    const accountId = newAccountId();
    await expect(
      database.runInAccountTransaction(accountId, async (transaction) => {
        await publishEvent(transaction, { accountId, eventName: 'lead.created', payload: {} });
        throw new Error('the change failed after publishing');
      }),
    ).rejects.toThrow('the change failed');
    const rows = await database.system.selectFrom('domain_events').selectAll().execute();
    expect(rows).toEqual([]);
  });

  it('refuses to publish for another business than the one the transaction is fenced to', async () => {
    const businessA = newAccountId();
    const businessB = newAccountId();
    await expect(
      database.runInAccountTransaction(businessA, (transaction) =>
        publishEvent(transaction, { accountId: businessB, eventName: 'lead.created', payload: {} }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses a badly named event and a payload that is too big', async () => {
    const accountId = newAccountId();
    await expect(publishFor(accountId, 'LeadCreated')).rejects.toThrow(/must look like/);
    await expect(publishFor(accountId, 'lead.created', { notes: 'x'.repeat(9_000) })).rejects.toThrow(/send ids/);
  });
});

describe('delivering events', () => {
  it('delivers an event once to its subscriber with the event and a context fenced to that business', async () => {
    const accountId = newAccountId();
    const received: { event: DomainEvent; accountContext: AccountContext }[] = [];
    const subscriber = defineModule({
      id: 'feature.audience',
      kind: 'feature',
      events: { 'lead.created': async (event, accountContext) => void received.push({ event, accountContext }) },
    });
    const eventId = await publishFor(accountId, 'lead.created', { leadId: 'abc' });

    const dispatcher = dispatcherFor([subscriber]);
    expect(await dispatcher.dispatchPendingEventsOnce()).toBe(1);
    expect(await dispatcher.dispatchPendingEventsOnce()).toBe(0); // already delivered

    expect(received).toHaveLength(1);
    expect(received[0]?.event).toMatchObject({
      id: eventId,
      accountId,
      name: 'lead.created',
      payload: { leadId: 'abc' },
    });
    expect(received[0]?.accountContext.accountId).toBe(accountId);
    expect(received[0]?.accountContext.actor).toEqual({ kind: 'system', id: 'feature.audience' });
    expect((await readEventRow(eventId)).dispatched_at).not.toBeNull();
  });

  it("gives a subscriber a context that can only see the event's own business", async () => {
    const businessA = newAccountId();
    const businessB = newAccountId();
    // Business B has an activity log line; the subscriber, working for A, must not be able to read it.
    await createContextFactory(database)(businessB, { kind: 'system', id: 'test' }).runInAccountTransaction(
      (transaction) =>
        createContextFactory(database)(businessB, { kind: 'system', id: 'test' }).audit(transaction, 'secret.of.b'),
    );
    let linesSeenBySubscriber = -1;
    const subscriber = defineModule({
      id: 'feature.audience',
      kind: 'feature',
      events: {
        'lead.created': async (_event, accountContext) => {
          linesSeenBySubscriber = (
            await accountContext.runInAccountTransaction((transaction) =>
              transaction.selectFrom('activity_log').selectAll().execute(),
            )
          ).length;
        },
      },
    });
    await publishFor(businessA, 'lead.created');
    await dispatcherFor([subscriber]).dispatchPendingEventsOnce();
    expect(linesSeenBySubscriber).toBe(0);
  });

  it('skips a module that is switched off for the business, and still finishes the event', async () => {
    const accountId = newAccountId();
    let wasCalled = false;
    const subscriber = defineModule({
      id: 'feature.audience',
      kind: 'feature',
      events: { 'lead.created': async () => void (wasCalled = true) },
    });
    const eventId = await publishFor(accountId, 'lead.created');
    const gateWithAudienceOff: ModuleGate = {
      isActive: async (_accountId, moduleId) => moduleId !== 'feature.audience',
    };

    await dispatcherFor([subscriber], gateWithAudienceOff).dispatchPendingEventsOnce();

    expect(wasCalled).toBe(false);
    expect((await readEventRow(eventId)).dispatched_at).not.toBeNull();
  });

  it('tries again later when a handler fails, and runs its sibling again too (handlers must be repeatable)', async () => {
    const accountId = newAccountId();
    let failuresLeft = 1;
    let siblingRuns = 0;
    const flaky = defineModule({
      id: 'feature.flaky',
      kind: 'feature',
      events: {
        'lead.created': async () => {
          if (failuresLeft-- > 0) throw new Error('temporary trouble');
        },
      },
    });
    const sibling = defineModule({
      id: 'feature.sibling',
      kind: 'feature',
      events: { 'lead.created': async () => void siblingRuns++ },
    });
    const eventId = await publishFor(accountId, 'lead.created');
    const dispatcher = dispatcherFor([flaky, sibling]);

    await dispatcher.dispatchPendingEventsOnce();
    const afterFirstTry = await readEventRow(eventId);
    expect(afterFirstTry.dispatched_at).toBeNull();
    expect(afterFirstTry.last_error).toBe('feature.flaky: temporary trouble');

    await dispatcher.dispatchPendingEventsOnce();
    expect((await readEventRow(eventId)).dispatched_at).not.toBeNull();
    expect(siblingRuns).toBe(2);
  });

  it('waits before the next attempt, and gives up after the last one', async () => {
    const accountId = newAccountId();
    const alwaysFails = defineModule({
      id: 'feature.broken',
      kind: 'feature',
      events: {
        'lead.created': async () => {
          throw new Error('still broken');
        },
      },
    });
    const eventId = await publishFor(accountId, 'lead.created');

    // A long wait: the second call finds nothing due.
    const patient = dispatcherFor([alwaysFails], everythingOn, { secondsBeforeRetry: () => 3600, maxAttempts: 3 });
    expect(await patient.dispatchPendingEventsOnce()).toBe(1);
    expect(await patient.dispatchPendingEventsOnce()).toBe(0);

    // No wait: attempts 2 and 3 happen straight away, then the event is parked as failed and left alone.
    await database.system
      .updateTable('domain_events')
      .set({ next_attempt_at: new Date() })
      .where('id', '=', eventId)
      .execute();
    const impatient = dispatcherFor([alwaysFails], everythingOn, { maxAttempts: 3 });
    expect(await impatient.dispatchPendingEventsOnce()).toBe(1);
    expect(await impatient.dispatchPendingEventsOnce()).toBe(1);
    const parked = await readEventRow(eventId);
    expect(parked).toMatchObject({ attempts: 3, last_error: 'feature.broken: still broken' });
    expect(parked.failed_at).not.toBeNull();
    expect(await impatient.dispatchPendingEventsOnce()).toBe(0);
  });

  it('keeps only a short error message, never database detail text that may hold personal data', async () => {
    const accountId = newAccountId();
    const leaky = defineModule({
      id: 'feature.leaky',
      kind: 'feature',
      events: {
        'lead.created': async () => {
          throw new Error('x'.repeat(1_000));
        },
      },
    });
    const eventId = await publishFor(accountId, 'lead.created');
    await dispatcherFor([leaky]).dispatchPendingEventsOnce();
    expect((await readEventRow(eventId)).last_error?.length).toBeLessThanOrEqual(300);
  });

  it('lets another instance take over an event whose lease ran out, but not one that is still leased', async () => {
    await publishFor(newAccountId(), 'lead.created');
    expect(await claimDueEvents(database.system, 10, 60)).toHaveLength(1);
    expect(await claimDueEvents(database.system, 10, 60)).toHaveLength(0); // still leased to the first claimer
    await database.system
      .updateTable('domain_events')
      .set({ locked_until: new Date(Date.now() - 1000) })
      .execute(); // lease ran out
    const takenOver = await claimDueEvents(database.system, 10, 60);
    expect(takenOver).toHaveLength(1);
    expect(takenOver[0]?.attempts).toBe(2);
  });
});

describe('the background loop', () => {
  it('delivers events by itself while running, and reports its state to /health', async () => {
    const delivered: string[] = [];
    const subscriber = defineModule({
      id: 'feature.audience',
      kind: 'feature',
      events: { 'lead.created': async (event) => void delivered.push(event.id) },
    });
    const dispatcher = dispatcherFor([subscriber], everythingOn, {
      pollIntervalMilliseconds: 20,
      staleAfterMilliseconds: 5_000,
    });
    await expect(dispatcher.healthCheck.check()).rejects.toThrow('not running');

    dispatcher.start();
    try {
      await dispatcher.healthCheck.check();
      const eventId = await publishFor(newAccountId(), 'lead.created');
      await waitFor(() => delivered.includes(eventId));
    } finally {
      await dispatcher.stop();
    }
    await expect(dispatcher.healthCheck.check()).rejects.toThrow('not running');
  });

  it('reports a problem when it has stopped checking', async () => {
    const dispatcher = dispatcherFor([], everythingOn, {
      pollIntervalMilliseconds: 60_000,
      staleAfterMilliseconds: 10,
    });
    dispatcher.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await expect(dispatcher.healthCheck.check()).rejects.toThrow('stopped checking');
    } finally {
      await dispatcher.stop();
    }
  });
});
