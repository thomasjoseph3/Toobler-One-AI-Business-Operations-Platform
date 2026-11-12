import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

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

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  withCsrfHeaders = true,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Adds a ticket as the person. */
const addTicket = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', '/tickets', body, withCsrfHeaders);

/** Reads one ticket as the person. */
const getTicket = (person: SignedInPerson | null, ticketId: string) => send(person, 'GET', `/tickets/${ticketId}`);

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Adds a contact through the real route and returns its id. */
async function addContact(person: SignedInPerson, name = 'Priya Menon'): Promise<string> {
  const response = await send(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('POST /api/v1/tickets', () => {
  it('adds an open ticket with the defaults, no owner and no notes, and shows the contact', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addTicket(person, { contactId, title: 'Refund for the December booking' });
    expect(response.statusCode, response.body).toBe(201);
    const ticket = response.json();
    expect(ticket).toMatchObject({
      contactId,
      contact: { id: contactId, name: 'Priya Menon' },
      title: 'Refund for the December booking',
      details: null,
      type: 'other',
      priority: 'normal',
      status: 'open',
      ownerUserId: null,
      conversationTypeKey: null,
      closedAt: null,
      closedByUserId: null,
      notes: [],
    });
    expect(Object.keys(ticket).sort()).toEqual([
      'closedAt',
      'closedByUserId',
      'contact',
      'contactId',
      'conversationTypeKey',
      'createdAt',
      'details',
      'id',
      'notes',
      'ownerUserId',
      'priority',
      'status',
      'title',
      'type',
      'updatedAt',
    ]);
  });

  it('takes a type, a priority, details and an owner from the same business', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addTicket(person, {
      contactId,
      title: 'Unhappy about the room',
      details: '  The air conditioner did not work.  ',
      type: 'complaint',
      priority: 'high',
      ownerUserId: person.profile.user.id,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      type: 'complaint',
      priority: 'high',
      details: 'The air conditioner did not work.',
      ownerUserId: person.profile.user.id,
    });
  });

  it('treats blank details as none and trims the title', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addTicket(person, { contactId, title: '  Call back  ', details: '   ' });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ title: 'Call back', details: null });
  });

  it('lets ordinary staff and the "own leads only" role add tickets', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await addTicket(person, { contactId, title: `Added as ${role}` })).statusCode).toBe(201);
    }
  });

  it('writes an activity-log line with field names only, and a ticket.created event', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, 'Secret Name');
    const ticket = (await addTicket(person, { contactId, title: 'Private title', priority: 'urgent' })).json();
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', ticket.id)
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({
      kind: 'tickets.created',
      record_type: 'ticket',
      actor: { kind: 'user', id: person.profile.user.id },
    });
    expect([...logLine.fields].sort()).toEqual(['contactId', 'priority', 'title']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'ticket.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({ ticketId: ticket.id, contactId, priority: 'urgent' });
    expect(JSON.stringify([logLine, event.payload])).not.toContain('Private title');
    expect(JSON.stringify([logLine, event.payload])).not.toContain('Secret Name');
  });

  it('stamps who created it', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticket = (await addTicket(person, { contactId, title: 'Stamped' })).json();
    const row = await database.system
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', ticket.id)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 401 with nobody signed in and 403 without the web app headers, and adds nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    expect((await addTicket(null, { contactId, title: 'x' })).statusCode).toBe(401);
    expect((await addTicket(person, { contactId, title: 'x' }, false)).statusCode).toBe(403);
    const count = await database.system
      .selectFrom('tickets')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(Number(count.total)).toBe(0);
  });

  it("answers 404 for a contact that is unknown, deleted or another business's", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersContactId = await addContact(stranger);
    expect((await addTicket(person, { contactId: randomUUID(), title: 'x' })).statusCode).toBe(404);
    expect((await addTicket(person, { contactId: strangersContactId, title: 'x' })).statusCode).toBe(404);

    const ownContactId = await addContact(person);
    expect((await send(person, 'DELETE', `/contacts/${ownContactId}`)).statusCode).toBe(204);
    expect((await addTicket(person, { contactId: ownContactId, title: 'x' })).statusCode).toBe(404);
  });

  it('answers 404 for an owner who works for another business', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addTicket(person, { contactId, title: 'x', ownerUserId: stranger.profile.user.id });
    expect(response.statusCode, response.body).toBe(404);
    expect((await addTicket(person, { contactId, title: 'x', ownerUserId: randomUUID() })).statusCode).toBe(404);
  });

  it('answers 400 for a missing or bad contact id, a missing or long title, bad words, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const badBodies: unknown[] = [
      {},
      { title: 'No contact' },
      { contactId: 'abc', title: 'x' },
      { contactId },
      { contactId, title: '   ' },
      { contactId, title: 'x'.repeat(201) },
      { contactId, title: 'x', details: 'y'.repeat(2001) },
      { contactId, title: 'x', type: 'sale' },
      { contactId, title: 'x', priority: 'critical' },
      { contactId, title: 'x', ownerUserId: 'abc' },
      { contactId, title: 'x', status: 'done' },
      { contactId, title: 'x', accountId: randomUUID() },
      { contactId, title: 'x', closedAt: '2026-01-01T00:00:00Z' },
    ];
    for (const body of badBodies) {
      const response = await addTicket(person, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('GET /api/v1/tickets/{id}', () => {
  it('reads one ticket with its notes, oldest first, and who wrote each', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticket = (await addTicket(person, { contactId, title: 'With notes' })).json();
    // The note route arrives in slice 4, so the notes are put in the database directly here.
    const accountId = person.profile.business.id;
    await database.system
      .insertInto('ticket_notes')
      .values([
        {
          id: randomUUID(),
          account_id: accountId,
          ticket_id: ticket.id,
          body: 'Second note',
          created_by: { kind: 'system', id: 'system' },
          created_at: new Date('2026-11-12T11:00:00Z'),
        },
        {
          id: randomUUID(),
          account_id: accountId,
          ticket_id: ticket.id,
          body: 'First note',
          created_by: { kind: 'user', id: person.profile.user.id },
          created_at: new Date('2026-11-12T10:00:00Z'),
        },
      ])
      .execute();
    const response = await getTicket(person, ticket.id);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().notes).toMatchObject([
      { body: 'First note', writtenByUserId: person.profile.user.id },
      { body: 'Second note', writtenByUserId: null },
    ]);
  });

  it('shows the ticket to every role of the business, even a ticket nobody gave them', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticket = (await addTicket(person, { contactId, title: 'Shared work' })).json();
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await getTicket(person, ticket.id)).statusCode).toBe(200);
    }
  });

  it('answers 401 with nobody signed in', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticket = (await addTicket(person, { contactId, title: 'x' })).json();
    expect((await getTicket(null, ticket.id)).statusCode).toBe(401);
  });

  it("answers 404 for an unknown id and for another business's ticket", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersContactId = await addContact(stranger);
    const strangersTicket = (await addTicket(stranger, { contactId: strangersContactId, title: 'Theirs' })).json();
    expect((await getTicket(person, randomUUID())).statusCode).toBe(404);
    expect((await getTicket(person, strangersTicket.id)).statusCode).toBe(404);
  });

  it('answers 400 for an id that is not a uuid', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await getTicket(person, 'abc')).statusCode).toBe(400);
  });
});
