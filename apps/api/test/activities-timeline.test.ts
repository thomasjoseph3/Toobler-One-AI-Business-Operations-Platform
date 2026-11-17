import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { handleLeadCreated, handleLeadMoved } from '../src/modules/core/activities/services/timeline-events.service';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// F07 slice 4: a new lead and a lead moving to another stage are written on the timeline by the activities module's event handlers.
// The handlers are called directly with the saved events of one business (never a dispatcher over the whole table, which would touch
// other tests' leads), the way the dispatcher calls them.

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

interface Person {
  browser: PretendBrowser;
  userId: string;
  businessId: string;
}

/** Signs a new owner up and in, with a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Sends a request and checks it answered with the expected status, returning the body (empty for 204). */
async function sendOk(
  person: Person,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  status = 200,
) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return status === 204 ? undefined : response.json();
}

/** The id of the stage with this name in the person's business. */
async function stageIdNamed(person: Person, name: string): Promise<string> {
  const stage = await database.system
    .selectFrom('pipeline_stages')
    .select('id')
    .where('account_id', '=', person.businessId)
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return stage.id;
}

/** Adds a contact and a lead for them, returning both ids. */
async function addContactAndLead(person: Person, name: string): Promise<{ contactId: string; leadId: string }> {
  const contact = await sendOk(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
  const lead = await sendOk(person, 'POST', '/leads', { contactId: contact.id, interest: 'Three nights' }, 201);
  return { contactId: contact.id, leadId: lead.id };
}

/** Hands every saved event of this name for this lead to the handler, the way the dispatcher would, and returns how many it handled. */
async function deliverEvents(
  person: Person,
  eventName: 'lead.created' | 'lead.moved',
  leadId: string,
  handler: typeof handleLeadCreated,
): Promise<number> {
  const rows = await database.system
    .selectFrom('domain_events')
    .selectAll()
    .where('account_id', '=', person.businessId)
    .where('name', '=', eventName)
    .execute();
  const rowsForLead = rows.filter((row) => (row.payload as { leadId?: string }).leadId === leadId);
  const contextFor = createContextFactory(database);
  for (const row of rowsForLead) {
    const event: DomainEvent = {
      id: row.id,
      accountId: row.account_id,
      name: row.name,
      payload: row.payload as Record<string, unknown>,
      occurredAt: row.occurred_at,
    };
    await handler(event, contextFor(person.businessId, { kind: 'system', id: 'core.activities' }));
  }
  return rowsForLead.length;
}

describe('stage changes and new leads on the timeline', () => {
  it('writes "lead added" with who added it, once, even when the event is delivered twice', async () => {
    const owner = await signUpAndSignIn();
    const { leadId, contactId } = await addContactAndLead(owner, 'Priya Menon');
    expect(await deliverEvents(owner, 'lead.created', leadId, handleLeadCreated)).toBe(1);
    await deliverEvents(owner, 'lead.created', leadId, handleLeadCreated);
    const timeline = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`);
    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'lead_created',
      leadId,
      contactId,
      body: null,
      writtenBy: { kind: 'user', userId: owner.userId, name: 'Anita Nair', role: 'manager' },
    });
  });

  it('writes "moved from one stage to another" with the stage names of the day, and the lost reason', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    await sendOk(owner, 'POST', `/leads/${leadId}/move`, { stageId: await stageIdNamed(owner, 'Contacted') });
    const lostReasons = await sendOk(owner, 'GET', '/lost-reasons');
    const reasonLabel = lostReasons.items[0].label as string;
    await sendOk(owner, 'POST', `/leads/${leadId}/move`, {
      stageId: await stageIdNamed(owner, 'Lost'),
      lostReason: reasonLabel,
    });
    expect(await deliverEvents(owner, 'lead.moved', leadId, handleLeadMoved)).toBe(2);
    const timeline = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&kind=stage_changed`);
    const details = timeline.items.map((item: { details: object }) => item.details);
    expect(details).toContainEqual({ fromStageName: 'New', toStageName: 'Contacted' });
    expect(details).toContainEqual({ fromStageName: 'Contacted', toStageName: 'Lost' });
    // A rename later does not change what was written
    await database.system
      .updateTable('pipeline_stages')
      .set({ name: 'Renamed later' })
      .where('id', '=', await stageIdNamed(owner, 'Contacted'))
      .execute();
    const again = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&kind=stage_changed`);
    expect(again.items.map((item: { details: object }) => item.details)).toContainEqual({
      fromStageName: 'New',
      toStageName: 'Contacted',
    });
  });

  it('keeps notes and lines apart: the kind filter, the totals, the note counts, and no edit or delete of a line', async () => {
    const owner = await signUpAndSignIn();
    const { leadId, contactId } = await addContactAndLead(owner, 'Priya Menon');
    await sendOk(owner, 'POST', '/notes', { leadId, body: 'Likes quiet rooms' }, 201);
    await deliverEvents(owner, 'lead.created', leadId, handleLeadCreated);
    const everything = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`);
    expect(everything.total).toBe(2);
    const onlyNotes = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&kind=note`);
    expect(onlyNotes.items.map((item: { kind: string }) => item.kind)).toEqual(['note']);
    expect(onlyNotes.total).toBe(1);
    // The person's timeline carries the line too
    const contactTimeline = await sendOk(owner, 'GET', `/activities?contact_id=${contactId}`);
    expect(contactTimeline.total).toBe(2);
    // Only notes are counted for the orange icon
    const counts = await sendOk(owner, 'GET', `/activities/counts?lead_ids=${leadId}`);
    expect(counts.counts[leadId]).toBe(1);
    // A line is not a note: it cannot be edited or deleted through the notes routes
    const line = everything.items.find((item: { kind: string }) => item.kind === 'lead_created');
    const edit = await owner.browser.send('PATCH', `/api/v1/notes/${line.id}`, { body: 'changed' });
    expect(edit.statusCode).toBe(404);
    const removal = await owner.browser.send('DELETE', `/api/v1/notes/${line.id}`);
    expect(removal.statusCode).toBe(404);
  });

  it('writes nothing for an event without the ids it needs, and nothing leaks to another business', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(first, 'Priya Menon');
    await deliverEvents(first, 'lead.created', leadId, handleLeadCreated);
    const contextFor = createContextFactory(database);
    const brokenEvent: DomainEvent = {
      id: crypto.randomUUID(),
      accountId: first.businessId,
      name: 'lead.moved',
      payload: { leadId },
      occurredAt: new Date(),
    };
    await handleLeadMoved(brokenEvent, contextFor(first.businessId, { kind: 'system', id: 'core.activities' }));
    const timeline = await sendOk(first, 'GET', `/activities?lead_id=${leadId}`);
    expect(timeline.total).toBe(1);
    const other = await second.browser.send('GET', `/api/v1/activities?lead_id=${leadId}`);
    expect(other.statusCode).toBe(404);
  });
});
