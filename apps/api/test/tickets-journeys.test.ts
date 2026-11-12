import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// Journey tests for tickets: whole stories told as one route after another, in pretend browsers that keep cookies like
// real ones. The other tests check one route at a time; these check that tickets, contacts, leads, the activity log, the
// events and the fence between businesses all work TOGETHER.

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

/** Signs a new owner up and in, and gives them a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Sends a request and checks it answered with the expected status, returning the response body (empty for 204). */
async function sendOk(
  person: Person,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  status = 200,
) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return status === 204 ? undefined : response.json();
}

/** Adds a contact and returns its id. */
async function addContact(person: Person, name: string): Promise<string> {
  return (await sendOk(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201)).id;
}

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: Person, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.userId).execute();
}

/** Adds a second person to the business straight into the database (the team screens come with F02). */
async function addColleague(person: Person): Promise<string> {
  const userId = randomUUID();
  await database.system
    .insertInto('users')
    .values({
      id: userId,
      account_id: person.businessId,
      email: `colleague-${userId.slice(0, 8)}@example.com`,
      name: 'Rahul Kumar',
      mobile_e164: null,
      mobile_key: null,
      role: 'staff',
    })
    .execute();
  return userId;
}

/** The activity-log kinds written for one record, oldest first. */
async function activityKindsFor(recordId: string): Promise<string[]> {
  const rows = await database.system
    .selectFrom('activity_log')
    .select('kind')
    .where('record_id', '=', recordId)
    .orderBy('id')
    .execute();
  return rows.map((row) => row.kind);
}

/** The names of the ticket events of one business that mention one ticket, oldest first. */
async function ticketEventNamesFor(person: Person, ticketId: string): Promise<string[]> {
  const rows = await database.system
    .selectFrom('domain_events')
    .select(['name', 'payload'])
    .where('account_id', '=', person.businessId)
    .where('name', 'like', 'ticket.%')
    .orderBy('id')
    .execute();
  return rows.filter((row) => (row.payload as { ticketId?: string }).ticketId === ticketId).map((row) => row.name);
}

describe('journey: the life of a complaint', () => {
  it('a customer complains → the manager raises a ticket → hands it to a colleague → notes → closed → reopened → closed again', async () => {
    const manager = await signUpAndSignIn();
    const colleagueId = await addColleague(manager);
    const contactId = await addContact(manager, 'Priya Menon');

    // The manager raises a complaint by hand: open, high priority, nobody owns it yet
    const ticket = await sendOk(
      manager,
      'POST',
      '/tickets',
      {
        contactId,
        title: 'Unhappy about the room',
        details: 'The air conditioner did not work.',
        type: 'complaint',
        priority: 'high',
      },
      201,
    );
    expect(ticket).toMatchObject({ status: 'open', ownerUserId: null, contact: { name: 'Priya Menon' } });
    expect(
      (await sendOk(manager, 'GET', '/tickets?ownerUserId=unassigned')).items.map((item: { id: string }) => item.id),
    ).toEqual([ticket.id]);

    // They hand it to a colleague; it moves from "unassigned" to the colleague's list
    await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, { ownerUserId: colleagueId });
    expect((await sendOk(manager, 'GET', '/tickets?ownerUserId=unassigned')).total).toBe(0);
    expect((await sendOk(manager, 'GET', `/tickets?ownerUserId=${colleagueId}`)).total).toBe(1);
    expect((await sendOk(manager, 'GET', '/tickets?ownerUserId=me')).total).toBe(0);

    // The person working the ticket (here: the same login, as the "own leads only" role) still sees every ticket and works
    // this one: tickets are shared work, unlike leads
    await setRole(manager, 'staff_own');
    expect((await sendOk(manager, 'GET', '/tickets')).total).toBe(1);
    await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, { note: 'Called her. Offered a refund of one night.' });
    await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, { priority: 'normal' });

    // Closing it with a note
    const closed = await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, {
      status: 'done',
      note: 'Refund sent. She is happy.',
    });
    expect(closed).toMatchObject({ status: 'done', closedByUserId: manager.userId });
    expect(closed.notes.map((note: { body: string }) => note.body)).toEqual([
      'Called her. Offered a refund of one night.',
      'Refund sent. She is happy.',
    ]);
    expect((await sendOk(manager, 'GET', '/tickets?status=open')).total).toBe(0);
    expect((await sendOk(manager, 'GET', '/tickets?status=done')).total).toBe(1);

    // A closed ticket is history: it takes a note, but not a change, until it is reopened
    await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, { note: 'She thanked us by phone.' });
    const refused = await manager.browser.send('PATCH', `/api/v1/tickets/${ticket.id}`, { priority: 'urgent' });
    expect(refused.statusCode).toBe(409);

    // She writes again; the manager reopens it and takes it over, then closes it for good
    await setRole(manager, 'manager');
    const reopened = await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, {
      status: 'open',
      ownerUserId: manager.userId,
      note: 'She wrote again about a towel.',
    });
    expect(reopened).toMatchObject({
      status: 'open',
      closedAt: null,
      closedByUserId: null,
      ownerUserId: manager.userId,
    });
    expect(reopened.notes).toHaveLength(4);
    await sendOk(manager, 'PATCH', `/tickets/${ticket.id}`, { status: 'done' });

    // Everything was recorded: the log and the events tell the same story in the same order, with no words from the customer
    const logKinds = await activityKindsFor(ticket.id);
    expect(logKinds).toHaveLength(11);
    expect(logKinds[0]).toBe('tickets.created');
    expect(logKinds.at(-1)).toBe('tickets.closed');
    const logCountOf = (kind: string) => logKinds.filter((logKind) => logKind === kind).length;
    expect({
      created: logCountOf('tickets.created'),
      updated: logCountOf('tickets.updated'), // handed to the colleague, priority, new owner
      noteAdded: logCountOf('tickets.note_added'),
      closed: logCountOf('tickets.closed'),
      reopened: logCountOf('tickets.reopened'),
    }).toEqual({ created: 1, updated: 3, noteAdded: 4, closed: 2, reopened: 1 });
    // Events written in one step share a moment, so only the order between steps is certain: the first and last are fixed
    // and the others are checked by how many of each there are.
    const eventNames = await ticketEventNamesFor(manager, ticket.id);
    expect(eventNames[0]).toBe('ticket.created');
    expect(eventNames.at(-1)).toBe('ticket.closed');
    const countOf = (name: string) => eventNames.filter((eventName) => eventName === name).length;
    expect(eventNames).toHaveLength(13);
    expect({
      created: countOf('ticket.created'),
      updated: countOf('ticket.updated'),
      assigned: countOf('ticket.assigned'),
      noteAdded: countOf('ticket.note_added'),
      closed: countOf('ticket.closed'),
      reopened: countOf('ticket.reopened'),
    }).toEqual({ created: 1, updated: 3, assigned: 2, noteAdded: 4, closed: 2, reopened: 1 });
    const everythingWritten = JSON.stringify(
      await database.system
        .selectFrom('activity_log')
        .selectAll()
        .where('account_id', '=', manager.businessId)
        .execute(),
    );
    expect(everythingWritten).not.toContain('air conditioner');
    expect(everythingWritten).not.toContain('She thanked us');
    expect(everythingWritten).not.toContain('Priya');
  });
});

describe('journey: tickets stay off the leads board', () => {
  it('a ticket for a contact does not make a lead, move a lead or change the contact; leads and tickets live side by side', async () => {
    const manager = await signUpAndSignIn();
    const contactId = await addContact(manager, 'Rahul Kumar');

    // A complaint from someone who has never enquired: a ticket, and nothing on the leads board
    const complaint = await sendOk(
      manager,
      'POST',
      '/tickets',
      { contactId, title: 'Wrong invoice', type: 'existing_customer' },
      201,
    );
    expect((await sendOk(manager, 'GET', '/leads')).total).toBe(0);
    expect((await sendOk(manager, 'GET', `/contacts/${contactId}`)).lifecycleStage).toBe('new');

    // Later the same person enquires: a lead is added and the contact becomes a lead; the open ticket does not get in the way
    const lead = await sendOk(manager, 'POST', '/leads', { contactId, interest: 'Weekend stay' }, 201);
    expect((await sendOk(manager, 'GET', `/contacts/${contactId}`)).lifecycleStage).toBe('lead');
    expect((await sendOk(manager, 'GET', `/leads?contactId=${contactId}`)).total).toBe(1);

    // Closing the ticket leaves the lead exactly as it was
    await sendOk(manager, 'PATCH', `/tickets/${complaint.id}`, { status: 'done', note: 'Corrected invoice sent.' });
    expect((await sendOk(manager, 'GET', `/leads/${lead.id}`)).stage.name).toBe('New');
    expect((await sendOk(manager, 'GET', `/contacts/${contactId}`)).lifecycleStage).toBe('lead');

    // "How many open tickets does this person have?" is answered by the list (what the contact page will ask)
    await sendOk(manager, 'POST', '/tickets', { contactId, title: 'Question about parking', type: 'question' }, 201);
    const openForContact = await sendOk(manager, 'GET', `/tickets?contactId=${contactId}&status=open`);
    expect(openForContact.total).toBe(1);
    expect(openForContact.items[0].title).toBe('Question about parking');

    // Deleting the contact keeps the tickets as history (they show no contact); no new ticket can be raised for it
    await sendOk(manager, 'DELETE', `/leads/${lead.id}`, undefined, 204);
    await sendOk(manager, 'DELETE', `/contacts/${contactId}`, undefined, 204);
    const afterDelete = await sendOk(manager, 'GET', `/tickets?contactId=${contactId}`);
    expect(afterDelete.total).toBe(2);
    expect(afterDelete.items.every((item: { contact: unknown }) => item.contact === null)).toBe(true);
    const refused = await manager.browser.send('POST', '/api/v1/tickets', { contactId, title: 'Too late' });
    expect(refused.statusCode).toBe(404);
  });
});

describe('journey: two businesses side by side', () => {
  it("one business cannot see, list, change, assign, note or close the other's tickets", async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();

    const contactId = await addContact(first, 'Only for the first business');
    const ticket = await sendOk(first, 'POST', '/tickets', { contactId, title: 'Private words' }, 201);
    await sendOk(
      second,
      'POST',
      '/tickets',
      { contactId: await addContact(second, 'Second'), title: 'Second only' },
      201,
    );

    // The second business sees only its own ticket
    const secondList = await sendOk(second, 'GET', '/tickets');
    expect(secondList.total).toBe(1);
    expect(secondList.items[0].title).toBe('Second only');
    expect((await sendOk(second, 'GET', `/tickets?contactId=${contactId}`)).total).toBe(0);
    expect((await sendOk(second, 'GET', `/tickets?ownerUserId=${first.userId}`)).total).toBe(0);

    // Every route that names the first business's ticket, contact or person answers 404 and changes nothing
    const attempts: Array<[string, 'GET' | 'POST' | 'PATCH', string, object | undefined]> = [
      ['read the ticket', 'GET', `/tickets/${ticket.id}`, undefined],
      ['rename the ticket', 'PATCH', `/tickets/${ticket.id}`, { title: 'Hacked' }],
      ['assign the ticket', 'PATCH', `/tickets/${ticket.id}`, { ownerUserId: second.userId }],
      ['add a note', 'PATCH', `/tickets/${ticket.id}`, { note: 'Sneaky' }],
      ['close the ticket', 'PATCH', `/tickets/${ticket.id}`, { status: 'done' }],
      ['raise a ticket for their contact', 'POST', '/tickets', { contactId, title: 'Sneaky' }],
      [
        'give their ticket to the first business owner',
        'POST',
        '/tickets',
        { contactId: await addContact(second, 'Another'), title: 'x', ownerUserId: first.userId },
      ],
    ];
    for (const [what, method, url, payload] of attempts) {
      const response = await second.browser.send(method, `/api/v1${url}`, payload);
      expect(response.statusCode, what).toBe(404);
    }

    // The first business's ticket is untouched
    const untouched = await sendOk(first, 'GET', `/tickets/${ticket.id}`);
    expect(untouched).toMatchObject({ title: 'Private words', status: 'open', ownerUserId: null, notes: [] });

    // And signed out, every ticket route is closed (with a well-formed body: a malformed one is refused with 400 before
    // the sign-in check, which is how every route of the app behaves)
    const stranger = createPretendBrowser(app);
    const signedOutAttempts: Array<['GET' | 'POST' | 'PATCH', string, object | undefined]> = [
      ['GET', '/api/v1/tickets', undefined],
      ['POST', '/api/v1/tickets', { contactId, title: 'x' }],
      ['GET', `/api/v1/tickets/${ticket.id}`, undefined],
      ['PATCH', `/api/v1/tickets/${ticket.id}`, { note: 'x' }],
    ];
    for (const [method, url, payload] of signedOutAttempts) {
      expect((await stranger.send(method, url, payload)).statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
