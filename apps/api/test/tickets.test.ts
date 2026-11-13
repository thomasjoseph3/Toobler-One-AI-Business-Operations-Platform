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

/** Lists tickets as the person. `query` is the part after the `?`. */
const listTickets = (person: SignedInPerson | null, query = '') =>
  send(person, 'GET', `/tickets${query ? `?${query}` : ''}`);

/** Adds a ticket through the real route and returns its id. */
async function addTicketAndGetId(person: SignedInPerson, contactId: string, fields: object = {}): Promise<string> {
  const response = await addTicket(person, { contactId, title: 'A ticket', ...fields });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** The ids of a list answer, in the order they came. */
const idsOf = (body: { items: Array<{ id: string }> }) => body.items.map((item) => item.id);

describe('GET /api/v1/tickets', () => {
  it("lists the business's tickets newest first, each with its contact, and no notes", async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, 'Anita Nair');
    const first = await addTicketAndGetId(person, contactId, { title: 'First' });
    const second = await addTicketAndGetId(person, contactId, { title: 'Second' });
    const response = await listTickets(person);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(idsOf(body)).toEqual([second, first]);
    expect(body).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(body.items[0]).toMatchObject({ title: 'Second', contact: { id: contactId, name: 'Anita Nair' } });
    expect(body.items[0]).not.toHaveProperty('notes');
  });

  it('is empty for a new business', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listTickets(person)).json()).toMatchObject({ items: [], total: 0 });
  });

  it("never shows another business's tickets", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await addTicketAndGetId(stranger, await addContact(stranger));
    const mine = await addTicketAndGetId(person, await addContact(person));
    expect(idsOf((await listTickets(person)).json())).toEqual([mine]);
  });

  it('filters by status', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const openTicket = await addTicketAndGetId(person, contactId);
    const doneTicket = await addTicketAndGetId(person, contactId);
    // Closing arrives in slice 4, so one ticket is closed directly in the database here.
    await database.system
      .updateTable('tickets')
      .set({ status: 'done', closed_at: new Date() })
      .where('id', '=', doneTicket)
      .execute();
    expect(idsOf((await listTickets(person, 'status=open')).json())).toEqual([openTicket]);
    expect(idsOf((await listTickets(person, 'status=done')).json())).toEqual([doneTicket]);
    expect((await listTickets(person)).json().total).toBe(2);
  });

  it('filters by owner: a person, me, and unassigned', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const mine = await addTicketAndGetId(person, contactId, { ownerUserId: person.profile.user.id });
    const nobodys = await addTicketAndGetId(person, contactId);
    expect(idsOf((await listTickets(person, `ownerUserId=${person.profile.user.id}`)).json())).toEqual([mine]);
    expect(idsOf((await listTickets(person, 'ownerUserId=me')).json())).toEqual([mine]);
    expect(idsOf((await listTickets(person, 'ownerUserId=unassigned')).json())).toEqual([nobodys]);
  });

  it('filters by type, priority and contact', async () => {
    const person = await createSignedInPerson(app, database);
    const priya = await addContact(person, 'Priya');
    const rahul = await addContact(person, 'Rahul');
    const complaint = await addTicketAndGetId(person, priya, { type: 'complaint', priority: 'urgent' });
    const callback = await addTicketAndGetId(person, rahul, { type: 'callback', priority: 'low' });
    expect(idsOf((await listTickets(person, 'type=complaint')).json())).toEqual([complaint]);
    expect(idsOf((await listTickets(person, 'priority=low')).json())).toEqual([callback]);
    expect(idsOf((await listTickets(person, `contactId=${rahul}`)).json())).toEqual([callback]);
    expect((await listTickets(person, `contactId=${priya}&type=callback`)).json().total).toBe(0);
  });

  it('pages, and reports the full total', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ids: string[] = [];
    for (let count = 0; count < 3; count += 1) ids.push(await addTicketAndGetId(person, contactId));
    const newestFirst = [...ids].reverse();
    const firstPage = (await listTickets(person, 'limit=2&page=1')).json();
    expect(idsOf(firstPage)).toEqual(newestFirst.slice(0, 2));
    expect(firstPage).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(idsOf((await listTickets(person, 'limit=2&page=2')).json())).toEqual(newestFirst.slice(2));
    expect(idsOf((await listTickets(person, 'limit=2&page=3')).json())).toEqual([]);
  });

  it('shows a ticket whose contact was deleted, with no contact', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await addTicketAndGetId(person, contactId);
    expect((await send(person, 'DELETE', `/contacts/${contactId}`)).statusCode).toBe(204);
    const item = (await listTickets(person)).json().items[0];
    expect(item).toMatchObject({ contactId, contact: null });
  });

  it('shows every ticket to every role, including tickets owned by someone else', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await addTicketAndGetId(person, contactId, { ownerUserId: person.profile.user.id });
    await addTicketAndGetId(person, contactId);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await listTickets(person)).json().total).toBe(2);
    }
  });

  it('answers 401 with nobody signed in', async () => {
    expect((await listTickets(null)).statusCode).toBe(401);
  });

  it('answers 400 for a bad filter or bad paging', async () => {
    const person = await createSignedInPerson(app, database);
    for (const query of [
      'limit=0',
      'limit=101',
      'page=0',
      'status=maybe',
      'ownerUserId=abc',
      'type=sale',
      'priority=critical',
      'contactId=abc',
    ]) {
      expect((await listTickets(person, query)).statusCode, query).toBe(400);
    }
  });
});

/** Changes a ticket as the person. */
const patchTicket = (person: SignedInPerson | null, ticketId: string, body: unknown, withCsrfHeaders = true) =>
  send(person, 'PATCH', `/tickets/${ticketId}`, body, withCsrfHeaders);

/** Closes a ticket directly in the database (the close route arrives in slice 4). */
async function closeTicketInDatabase(ticketId: string) {
  await database.system
    .updateTable('tickets')
    .set({ status: 'done', closed_at: new Date() })
    .where('id', '=', ticketId)
    .execute();
}

describe('PATCH /api/v1/tickets/{id}', () => {
  it('changes the title, details, type and priority, and leaves the rest as it was', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticketId = await addTicketAndGetId(person, contactId, { title: 'Old title', priority: 'low' });
    const response = await patchTicket(person, ticketId, {
      title: '  New title  ',
      details: 'More words',
      type: 'complaint',
      priority: 'urgent',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: ticketId,
      title: 'New title',
      details: 'More words',
      type: 'complaint',
      priority: 'urgent',
      status: 'open',
      ownerUserId: null,
      contactId,
    });
  });

  it('assigns the ticket to a person of the business, and takes it away again with null', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    const assigned = await patchTicket(person, ticketId, { ownerUserId: person.profile.user.id });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect(assigned.json().ownerUserId).toBe(person.profile.user.id);
    const unassigned = await patchTicket(person, ticketId, { ownerUserId: null });
    expect(unassigned.json().ownerUserId).toBeNull();
  });

  it('clears the details with null or blank text, but not the title', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person), { details: 'Some details' });
    expect((await patchTicket(person, ticketId, { details: null })).json().details).toBeNull();
    await patchTicket(person, ticketId, { details: 'Again' });
    expect((await patchTicket(person, ticketId, { details: '   ' })).json().details).toBeNull();
    expect((await patchTicket(person, ticketId, { title: '   ' })).statusCode).toBe(400);
  });

  it('writes one activity-log line with the changed field names only, and a ticket.updated event', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { title: 'Secret new title', priority: 'high' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', ticketId)
      .where('kind', '=', 'tickets.updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect([...lines[0]!.fields].sort()).toEqual(['priority', 'title']);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', 'in', ['ticket.updated', 'ticket.assigned'])
      .execute();
    expect(events.map((event) => event.name)).toEqual(['ticket.updated']);
    expect(JSON.stringify([lines, events])).not.toContain('Secret new title');
  });

  it('publishes ticket.assigned when the owner changes, with the old and new owner', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { ownerUserId: person.profile.user.id });
    await patchTicket(person, ticketId, { ownerUserId: null });
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'ticket.assigned')
      .orderBy('id', 'asc')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([
      { ticketId, ownerUserId: person.profile.user.id, previousOwnerUserId: null },
      { ticketId, ownerUserId: null, previousOwnerUserId: person.profile.user.id },
    ]);
  });

  it('writes nothing when the values sent are the ones it already has', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person), { title: 'Same', priority: 'high' });
    const before = (await getTicket(person, ticketId)).json();
    const response = await patchTicket(person, ticketId, { title: 'Same', priority: 'high', ownerUserId: null });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().updatedAt).toBe(before.updatedAt);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', ticketId)
      .where('kind', '=', 'tickets.updated')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('stamps who changed it last', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { priority: 'low' });
    const row = await database.system
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', ticketId)
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 409 TICKET_CLOSED for a closed ticket, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person), { title: 'Closed one' });
    await closeTicketInDatabase(ticketId);
    const response = await patchTicket(person, ticketId, { title: 'Too late' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TICKET_CLOSED');
    expect((await getTicket(person, ticketId)).json().title).toBe('Closed one');
  });

  it('lets every role change a ticket', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await patchTicket(person, ticketId, { title: `Changed by ${role}` })).statusCode).toBe(200);
    }
  });

  it('answers 401 with nobody signed in and 403 without the web app headers, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person), { title: 'Untouched' });
    expect((await patchTicket(null, ticketId, { title: 'x' })).statusCode).toBe(401);
    expect((await patchTicket(person, ticketId, { title: 'x' }, false)).statusCode).toBe(403);
    expect((await getTicket(person, ticketId)).json().title).toBe('Untouched');
  });

  it("answers 404 for an unknown ticket, another business's ticket, and an owner from another business", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersTicket = await addTicketAndGetId(stranger, await addContact(stranger), { title: 'Theirs' });
    const ownTicket = await addTicketAndGetId(person, await addContact(person));
    expect((await patchTicket(person, randomUUID(), { title: 'x' })).statusCode).toBe(404);
    expect((await patchTicket(person, strangersTicket, { title: 'Mine now' })).statusCode).toBe(404);
    expect((await getTicket(stranger, strangersTicket)).json().title).toBe('Theirs');
    const wrongOwner = await patchTicket(person, ownTicket, { ownerUserId: stranger.profile.user.id });
    expect(wrongOwner.statusCode, wrongOwner.body).toBe(404);
    expect((await patchTicket(person, ownTicket, { ownerUserId: randomUUID() })).statusCode).toBe(404);
  });

  it('answers 400 for nothing to change, bad values, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    const empty = await patchTicket(person, ticketId, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('NOTHING_TO_CHANGE');
    const badBodies: unknown[] = [
      { title: 'x'.repeat(201) },
      { details: 'y'.repeat(2001) },
      { type: 'sale' },
      { priority: 'critical' },
      { ownerUserId: 'abc' },
      { status: 'maybe' },
      { note: 'n'.repeat(2001) },
      { contactId: randomUUID() },
      { accountId: randomUUID() },
      { closedAt: '2026-01-01T00:00:00Z' },
      { closedBy: 'someone' },
      { notes: ['x'] },
    ];
    for (const body of badBodies) {
      expect((await patchTicket(person, ticketId, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await patchTicket(person, 'abc', { title: 'x' })).statusCode).toBe(400);
  });
});

/** The names of the events of one kind published for the business, oldest first. */
async function eventsNamed(person: SignedInPerson, name: string) {
  return database.system
    .selectFrom('domain_events')
    .selectAll()
    .where('account_id', '=', person.profile.business.id)
    .where('name', '=', name)
    .orderBy('id', 'asc')
    .execute();
}

describe('PATCH /api/v1/tickets/{id}: notes, closing and reopening', () => {
  it('adds notes, oldest first, each remembering who wrote it', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    const first = await patchTicket(person, ticketId, { note: '  Called the customer.  ' });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().status).toBe('open');
    await patchTicket(person, ticketId, { note: 'Promised a refund by Friday.' });
    const notes = (await getTicket(person, ticketId)).json().notes;
    expect(notes).toMatchObject([
      { body: 'Called the customer.', writtenByUserId: person.profile.user.id },
      { body: 'Promised a refund by Friday.', writtenByUserId: person.profile.user.id },
    ]);
  });

  it('logs that a note was added without its words, and publishes ticket.note_added', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { note: 'Secret note words' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', ticketId)
      .where('kind', '=', 'tickets.note_added')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.fields).toEqual(['note']);
    const events = await eventsNamed(person, 'ticket.note_added');
    expect(events).toHaveLength(1);
    expect(JSON.stringify([lines, events])).not.toContain('Secret note words');
  });

  it('closes a ticket with a note in one step, remembering who closed it and when', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    const response = await patchTicket(person, ticketId, { status: 'done', note: 'Refund sent.' });
    expect(response.statusCode, response.body).toBe(200);
    const ticket = response.json();
    expect(ticket).toMatchObject({ status: 'done', closedByUserId: person.profile.user.id });
    expect(ticket.closedAt).not.toBeNull();
    expect(ticket.notes).toMatchObject([{ body: 'Refund sent.' }]);
    expect((await listTickets(person, 'status=done')).json().total).toBe(1);
    expect((await listTickets(person, 'status=open')).json().total).toBe(0);
  });

  it('writes a closing log line and a ticket.closed event, and no field-edit line', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const ticketId = await addTicketAndGetId(person, contactId, { ownerUserId: person.profile.user.id });
    await patchTicket(person, ticketId, { status: 'done' });
    const lines = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', ticketId)
      .execute();
    expect(lines.map((line) => line.kind).sort()).toEqual(['tickets.closed', 'tickets.created']);
    const events = await eventsNamed(person, 'ticket.closed');
    expect(events.map((event) => event.payload)).toEqual([
      { ticketId, contactId, ownerUserId: person.profile.user.id },
    ]);
  });

  it('closes and edits in one step when the ticket is open', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    const response = await patchTicket(person, ticketId, { status: 'done', priority: 'low' });
    expect(response.json()).toMatchObject({ status: 'done', priority: 'low' });
  });

  it('answers 200 and changes nothing when closing a closed ticket or opening an open one', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    expect((await patchTicket(person, ticketId, { status: 'open' })).statusCode).toBe(200);
    await patchTicket(person, ticketId, { status: 'done' });
    const closed = (await getTicket(person, ticketId)).json();
    const again = await patchTicket(person, ticketId, { status: 'done' });
    expect(again.statusCode).toBe(200);
    expect(again.json().closedAt).toBe(closed.closedAt);
    expect(await eventsNamed(person, 'ticket.closed')).toHaveLength(1);
    expect(await eventsNamed(person, 'ticket.reopened')).toHaveLength(0);
  });

  it('still takes a note on a closed ticket, but refuses any other change with 409', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person), { title: 'Closed one' });
    await patchTicket(person, ticketId, { status: 'done' });
    const noted = await patchTicket(person, ticketId, { note: 'Customer thanked us.' });
    expect(noted.statusCode, noted.body).toBe(200);
    expect(noted.json()).toMatchObject({ status: 'done', notes: [{ body: 'Customer thanked us.' }] });
    const refused = await patchTicket(person, ticketId, { title: 'Too late', note: 'Not saved either' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('TICKET_CLOSED');
    const ticket = (await getTicket(person, ticketId)).json();
    expect(ticket.title).toBe('Closed one');
    expect(ticket.notes).toHaveLength(1);
  });

  it('reopens a closed ticket, clearing who closed it and when, and keeping its notes', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { status: 'done', note: 'Closed too soon' });
    const response = await patchTicket(person, ticketId, { status: 'open' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'open', closedAt: null, closedByUserId: null });
    expect(response.json().notes).toHaveLength(1);
    expect(await eventsNamed(person, 'ticket.reopened')).toHaveLength(1);
    const row = await database.system
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', ticketId)
      .executeTakeFirstOrThrow();
    expect(row.closed_at).toBeNull();
    expect(row.closed_by).toBeNull();
  });

  it('reopens and changes the ticket in one step', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await patchTicket(person, ticketId, { status: 'done' });
    const response = await patchTicket(person, ticketId, {
      status: 'open',
      ownerUserId: person.profile.user.id,
      note: 'Reopened and taken over',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'open',
      ownerUserId: person.profile.user.id,
      notes: [{ body: 'Reopened and taken over' }],
    });
  });

  it('lets every role add notes and close tickets', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await patchTicket(person, ticketId, { note: `Note from ${role}` })).statusCode).toBe(200);
    }
    expect((await patchTicket(person, ticketId, { status: 'done' })).statusCode).toBe(200);
  });

  it('keeps notes inside their business: another business cannot add to or see them', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    expect((await patchTicket(stranger, ticketId, { note: 'Sneaky' })).statusCode).toBe(404);
    expect((await patchTicket(stranger, ticketId, { status: 'done' })).statusCode).toBe(404);
    const ticket = (await getTicket(person, ticketId)).json();
    expect(ticket.notes).toEqual([]);
    expect(ticket.status).toBe('open');
  });

  it('answers 400 for a status it does not know, a note that is too long, and a blank note on its own', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    expect((await patchTicket(person, ticketId, { status: 'maybe' })).statusCode).toBe(400);
    expect((await patchTicket(person, ticketId, { note: 'n'.repeat(2001) })).statusCode).toBe(400);
    const blank = await patchTicket(person, ticketId, { note: '   ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().error.code).toBe('NOTHING_TO_CHANGE');
  });

  it('has a database rule that a ticket is done only when it has a closing time', async () => {
    const person = await createSignedInPerson(app, database);
    const ticketId = await addTicketAndGetId(person, await addContact(person));
    await expect(
      database.system.updateTable('tickets').set({ status: 'done' }).where('id', '=', ticketId).execute(),
    ).rejects.toThrow();
  });
});
