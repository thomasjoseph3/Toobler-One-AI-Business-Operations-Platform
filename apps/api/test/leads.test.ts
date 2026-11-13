import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { pino } from 'pino';
import { createContextFactory } from '../src/kernel/context';
import { createEventDispatcher } from '../src/kernel/events/dispatcher';
import { createRegistry } from '../src/kernel/module-system/registry';
import { modules } from '../src/modules';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase, waitFor } from './support/harness';

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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

/** Adds a lead by hand as the person. */
const addLead = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', '/leads', body, withCsrfHeaders);

/** Lists leads as the person. `query` is the part after the `?`. */
const listLeads = (person: SignedInPerson | null, query = '') =>
  send(person, 'GET', `/leads${query ? `?${query}` : ''}`);

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Adds a contact through the real route and returns its id. */
async function addContact(person: SignedInPerson, name = 'Priya Menon'): Promise<string> {
  const response = await send(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

/** The id of the person's stage with this name. */
async function stageIdNamed(person: SignedInPerson, name: string): Promise<string> {
  const stage = await database.system
    .selectFrom('pipeline_stages')
    .select('id')
    .where('account_id', '=', person.profile.business.id)
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return stage.id;
}

/** Closes a lead the way the move route will: into Won or Lost, `daysAgo` days ago. */
async function closeLead(person: SignedInPerson, leadId: string, outcome: 'Won' | 'Lost', daysAgo: number) {
  await database.system
    .updateTable('leads')
    .set({
      stage_id: await stageIdNamed(person, outcome),
      closed_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      ...(outcome === 'Lost' ? { lost_reason: 'Too costly' } : {}),
    })
    .where('id', '=', leadId)
    .execute();
}

describe('POST /api/v1/leads', () => {
  it('adds a lead in the first stage, owned by the business owner, with the contact shown and the stage named', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addLead(person, {
      contactId,
      interest: '3 nights in December, 4 people',
      dateFrom: '2026-12-20',
      dateTo: '2026-12-23',
      partySize: 4,
      budgetPaise: 4_500_000,
      promise: 'We will call tomorrow',
      callbackAt: '2026-12-01T10:00:00Z',
    });
    expect(response.statusCode, response.body).toBe(201);
    const lead = response.json();
    expect(lead).toMatchObject({
      contactId,
      contact: { id: contactId, name: 'Priya Menon' },
      stage: { name: 'New', kind: 'open' },
      temperature: 'unscored',
      interest: '3 nights in December, 4 people',
      dateFrom: '2026-12-20',
      dateTo: '2026-12-23',
      partySize: 4,
      budgetPaise: 4_500_000,
      promise: 'We will call tomorrow',
      callbackAt: '2026-12-01T10:00:00.000Z',
      ownerUserId: person.profile.user.id,
      firstChannel: 'manual',
      lostReason: null,
      closedAt: null,
    });
    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(lead).sort()).toEqual(
      [
        'budgetPaise',
        'callbackAt',
        'closedAt',
        'contact',
        'contactId',
        'createdAt',
        'dateFrom',
        'dateTo',
        'firstChannel',
        'id',
        'interest',
        'lastActivityAt',
        'lostReason',
        'offering',
        'ownerUserId',
        'partySize',
        'promise',
        'stage',
        'temperature',
        'updatedAt',
      ].sort(),
    );
  });

  it('needs only the contact, and treats blank text as not given', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const response = await addLead(person, { contactId, interest: '  ', dateFrom: '', promise: '' });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ interest: null, dateFrom: null, partySize: null, budgetPaise: null });
  });

  it("moves the contact's lifecycle stage to lead", async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    expect((await send(person, 'GET', `/contacts/${contactId}`)).json().lifecycleStage).toBe('new');
    await addLead(person, { contactId });
    expect((await send(person, 'GET', `/contacts/${contactId}`)).json().lifecycleStage).toBe('lead');
  });

  it('keeps a contact marked "not a fit" as it is', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const marked = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contactId}`,
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
      payload: { notAFit: true },
    });
    expect(marked.statusCode, marked.body).toBe(200);
    await addLead(person, { contactId });
    expect((await send(person, 'GET', `/contacts/${contactId}`)).json().lifecycleStage).toBe('not_a_fit');
  });

  it('refuses a second lead for a contact that already has an open one, naming that lead', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const first = (await addLead(person, { contactId })).json();
    const second = await addLead(person, { contactId });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: 'LEAD_OPEN', details: { leadId: first.id } });
    expect((await listLeads(person, `contactId=${contactId}`)).json().total).toBe(1);
  });

  it('lets only one of two simultaneous requests for the same contact win', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const responses = await Promise.all([addLead(person, { contactId }), addLead(person, { contactId })]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const loser = responses.find((response) => response.statusCode === 409)!;
    expect(loser.json().error.code).toBe('LEAD_OPEN');
    expect((await listLeads(person, `contactId=${contactId}`)).json().total).toBe(1);
  });

  it('points to the lead when the last one was lost less than 60 days ago (rule R6)', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const first = (await addLead(person, { contactId })).json();
    await closeLead(person, first.id, 'Lost', 10);
    const response = await addLead(person, { contactId });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'LEAD_RECENTLY_LOST', details: { leadId: first.id } });
  });

  it('starts a new lead when the last one was lost 60 days ago or more', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const first = (await addLead(person, { contactId })).json();
    await closeLead(person, first.id, 'Lost', 61);
    const response = await addLead(person, { contactId });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().id).not.toBe(first.id);
  });

  it('starts a new lead for a person who just bought (a new purchase), and then calls them a customer-lead again', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const first = (await addLead(person, { contactId })).json();
    await closeLead(person, first.id, 'Won', 5);
    expect((await addLead(person, { contactId })).statusCode).toBe(201);
    // One won lead makes a customer, and that wins over having an open lead
    expect((await send(person, 'GET', `/contacts/${contactId}`)).json().lifecycleStage).toBe('customer');
  });

  it('accepts the owner being named, and refuses a person from another business or an unknown person with 404', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const named = await addLead(person, { contactId: await addContact(person), ownerUserId: person.profile.user.id });
    expect(named.statusCode, named.body).toBe(201);
    for (const ownerUserId of [stranger.profile.user.id, randomUUID()]) {
      const contactId = await addContact(person);
      const response = await addLead(person, { contactId, ownerUserId });
      expect(response.statusCode, ownerUserId).toBe(404);
      expect((await listLeads(person, `contactId=${contactId}`)).json().total).toBe(0);
    }
  });

  it("answers 404 for another business's contact, an unknown contact, and a deleted contact", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersContactId = await addContact(stranger);
    expect((await addLead(person, { contactId: strangersContactId })).statusCode).toBe(404);
    expect((await addLead(person, { contactId: randomUUID() })).statusCode).toBe(404);
    const deletedContactId = await addContact(person);
    expect((await send(person, 'DELETE', `/contacts/${deletedContactId}`)).statusCode).toBe(204);
    expect((await addLead(person, { contactId: deletedContactId })).statusCode).toBe(404);
    expect((await listLeads(stranger)).json().total).toBe(0);
  });

  it('lets ordinary staff add leads', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await makeStaff(person);
    expect((await addLead(person, { contactId })).statusCode).toBe(201);
  });

  it('records who did it in the activity log and the outbox, with ids only and no lead text', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const lead = (await addLead(person, { contactId, interest: 'Secret-interest-words', partySize: 2 })).json();
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({
      kind: 'leads.created',
      record_type: 'lead',
      actor: { kind: 'user', id: person.profile.user.id },
    });
    expect([...logLine.fields].sort()).toEqual(['contactId', 'interest', 'partySize']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lead.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({
      leadId: lead.id,
      contactId,
      ownerUserId: person.profile.user.id,
      offeringId: null,
    });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-interest-words');
    const stored = await database.system
      .selectFrom('leads')
      .select(['created_by', 'updated_by'])
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(stored.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 401 with nobody signed in and 403 without the web app headers, and adds nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    expect((await addLead(null, { contactId })).statusCode).toBe(401);
    expect((await addLead(person, { contactId }, false)).statusCode).toBe(403);
    expect((await listLeads(person)).json().total).toBe(0);
  });

  it('answers 400 for a missing or bad contact id, bad dates, bad numbers, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    const badBodies: unknown[] = [
      {},
      { contactId: 'abc' },
      { contactId, dateFrom: '20/12/2026' },
      { contactId, dateFrom: '2026-02-31' },
      { contactId, dateFrom: '2026-12-23', dateTo: '2026-12-20' },
      { contactId, partySize: 0 },
      { contactId, partySize: 1.5 },
      { contactId, budgetPaise: -1 },
      { contactId, budgetPaise: 10.5 },
      { contactId, budgetPaise: 2_000_000_000_000 },
      { contactId, callbackAt: 'tomorrow' },
      { contactId, interest: 'x'.repeat(1001) },
      { contactId, promise: 'x'.repeat(501) },
      { contactId, ownerUserId: 'abc' },
      { contactId, stageId: randomUUID() },
      { contactId, temperature: 'hot' },
      { contactId, accountId: randomUUID() },
      { contactId, firstChannel: 'phone' },
    ];
    for (const body of badBodies) {
      expect((await addLead(person, body)).statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await listLeads(person)).json().total).toBe(0);
  });
});

describe('GET /api/v1/leads (list)', () => {
  it('lists the leads with their contact and stage, newest activity first, with paging details', async () => {
    const person = await createSignedInPerson(app, database);
    const olderContactId = await addContact(person, 'Older');
    const newerContactId = await addContact(person, 'Newer');
    const older = (await addLead(person, { contactId: olderContactId })).json();
    const newer = (await addLead(person, { contactId: newerContactId })).json();
    await database.system
      .updateTable('leads')
      .set({ last_activity_at: new Date('2026-01-01T00:00:00Z') })
      .where('id', '=', older.id)
      .execute();
    const response = await listLeads(person);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ view: 'list', total: 2, page: 1, limit: 25 });
    expect(body.items.map((lead: { id: string }) => lead.id)).toEqual([newer.id, older.id]);
    expect(body.items[0]).toMatchObject({ contact: { name: 'Newer' }, stage: { name: 'New' } });
  });

  it('pages the results', async () => {
    const person = await createSignedInPerson(app, database);
    for (let count = 0; count < 3; count += 1) await addLead(person, { contactId: await addContact(person) });
    const firstPage = (await listLeads(person, 'limit=2&page=1')).json();
    const secondPage = (await listLeads(person, 'limit=2&page=2')).json();
    expect(firstPage).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    expect(firstPage.items.map((lead: { id: string }) => lead.id)).not.toContain(secondPage.items[0].id);
  });

  it('orders by when the lead was added, the next callback, or the stage, either way, and the same on every page', async () => {
    const person = await createSignedInPerson(app, database);
    const first = (
      await addLead(person, { contactId: await addContact(person), callbackAt: '2026-12-02T10:00:00Z' })
    ).json();
    const second = (await addLead(person, { contactId: await addContact(person) })).json(); // no callback date
    const third = (
      await addLead(person, { contactId: await addContact(person), callbackAt: '2026-12-01T10:00:00Z' })
    ).json();
    await database.system
      .updateTable('leads')
      .set({ created_at: new Date('2026-01-01T00:00:00Z') })
      .where('id', '=', first.id)
      .execute();
    await database.system
      .updateTable('leads')
      .set({ created_at: new Date('2026-01-02T00:00:00Z') })
      .where('id', '=', second.id)
      .execute();
    await database.system
      .updateTable('leads')
      .set({ created_at: new Date('2026-01-03T00:00:00Z') })
      .where('id', '=', third.id)
      .execute();
    await send(person, 'POST', `/leads/${third.id}/move`, { stageId: await stageIdNamed(person, 'Contacted') });

    const ids = async (query: string) =>
      (await listLeads(person, query)).json().items.map((lead: { id: string }) => lead.id);
    expect(await ids('sort=createdAt&order=asc')).toEqual([first.id, second.id, third.id]);
    expect(await ids('sort=createdAt')).toEqual([third.id, second.id, first.id]);
    // Soonest callback first; the lead with no callback date is last either way round
    expect(await ids('sort=callbackAt&order=asc')).toEqual([third.id, first.id, second.id]);
    expect(await ids('sort=callbackAt&order=desc')).toEqual([first.id, third.id, second.id]);
    // New comes before Contacted in the pipeline
    expect((await ids('sort=stage&order=asc'))[2]).toBe(third.id);
    expect((await ids('sort=stage&order=desc'))[0]).toBe(third.id);
    // Paging keeps one order: two pages of one lead each show different leads
    const pageOne = await ids('sort=createdAt&order=asc&limit=1&page=1');
    const pageTwo = await ids('sort=createdAt&order=asc&limit=1&page=2');
    expect([...pageOne, ...pageTwo]).toEqual([first.id, second.id]);
  });

  it('still gives the right total for a page past the last one, and for a list with no leads', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listLeads(person)).json()).toMatchObject({ total: 0, items: [] });
    for (let count = 0; count < 3; count += 1) await addLead(person, { contactId: await addContact(person) });
    // 3 leads, 2 to a page: page 2 holds 1, page 5 holds none but the total is still 3
    expect((await listLeads(person, 'limit=2&page=2')).json()).toMatchObject({ total: 3, page: 2 });
    expect((await listLeads(person, 'limit=2&page=2')).json().items).toHaveLength(1);
    const pastTheEnd = (await listLeads(person, 'limit=2&page=5')).json();
    expect(pastTheEnd).toMatchObject({ total: 3, page: 5, items: [] });
    // The total follows the filters, not the whole business
    expect((await listLeads(person, 'status=closed')).json()).toMatchObject({ total: 0, items: [] });
  });

  it('filters by stage, owner, contact and open or closed', async () => {
    const person = await createSignedInPerson(app, database);
    const openContactId = await addContact(person);
    const wonContactId = await addContact(person);
    const openLead = (await addLead(person, { contactId: openContactId })).json();
    const wonLead = (await addLead(person, { contactId: wonContactId })).json();
    await closeLead(person, wonLead.id, 'Won', 1);

    const ids = async (query: string) =>
      (await listLeads(person, query)).json().items.map((lead: { id: string }) => lead.id);
    expect(await ids(`status=open`)).toEqual([openLead.id]);
    expect(await ids(`status=closed`)).toEqual([wonLead.id]);
    expect(await ids(`stageId=${await stageIdNamed(person, 'Won')}`)).toEqual([wonLead.id]);
    expect(await ids(`contactId=${openContactId}`)).toEqual([openLead.id]);
    expect(await ids(`ownerUserId=${person.profile.user.id}`)).toHaveLength(2);
    expect(await ids(`ownerUserId=${randomUUID()}`)).toEqual([]);
  });

  it('leaves out deleted leads, and shows no contact for a deleted contact', async () => {
    const person = await createSignedInPerson(app, database);
    const deletedLead = (await addLead(person, { contactId: await addContact(person) })).json();
    const contactId = await addContact(person);
    const keptLead = (await addLead(person, { contactId })).json();
    await database.system
      .updateTable('leads')
      .set({ deleted_at: new Date() })
      .where('id', '=', deletedLead.id)
      .execute();
    await send(person, 'DELETE', `/contacts/${contactId}`);
    const body = (await listLeads(person)).json();
    expect(body.items.map((lead: { id: string }) => lead.id)).toEqual([keptLead.id]);
    expect(body.items[0].contact).toBeNull();
  });

  it("never shows another business's leads", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addLead(first, { contactId: await addContact(first) });
    expect((await listLeads(second)).json()).toMatchObject({ total: 0, items: [] });
    expect((await listLeads(second, `stageId=${await stageIdNamed(first, 'New')}`)).json().total).toBe(0);
  });

  it('lets ordinary staff read it', async () => {
    const person = await createSignedInPerson(app, database);
    await makeStaff(person);
    expect((await listLeads(person)).statusCode).toBe(200);
  });

  it('answers 401 with nobody signed in and 400 for a bad query', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listLeads(null)).statusCode).toBe(401);
    for (const query of [
      'limit=0',
      'limit=101',
      'page=0',
      'view=map',
      'stageId=abc',
      'status=maybe',
      'ownerUserId=abc',
      'sort=name',
      'order=sideways',
    ]) {
      expect((await listLeads(person, query)).statusCode, query).toBe(400);
    }
  });
});

describe('GET /api/v1/leads?view=board', () => {
  it("gives a column per stage in board order with each stage's leads and counts", async () => {
    const person = await createSignedInPerson(app, database);
    const newLead = (await addLead(person, { contactId: await addContact(person) })).json();
    const wonLead = (await addLead(person, { contactId: await addContact(person) })).json();
    await closeLead(person, wonLead.id, 'Won', 1);

    const response = await listLeads(person, 'view=board');
    expect(response.statusCode, response.body).toBe(200);
    const board = response.json();
    expect(board.view).toBe('board');
    expect(board.columns.map((column: { stage: { name: string } }) => column.stage.name)).toEqual([
      'New',
      'Contacted',
      'Quoted',
      'Won',
      'Lost',
    ]);
    expect(board.columns.map((column: { leadCount: number }) => column.leadCount)).toEqual([1, 0, 0, 1, 0]);
    expect(board.columns[0].leads.map((lead: { id: string }) => lead.id)).toEqual([newLead.id]);
    expect(board.columns[3].leads.map((lead: { id: string }) => lead.id)).toEqual([wonLead.id]);
    expect(board.columns[0].leads[0].contact.name).toBe('Priya Menon');
    expect(board.columns.every((column: { hasMore: boolean }) => column.hasMore === false)).toBe(true);
  });

  it('shows an empty board for a new business', async () => {
    const person = await createSignedInPerson(app, database);
    const board = (await listLeads(person, 'view=board')).json();
    expect(board.columns).toHaveLength(5);
    expect(board.columns.every((column: { leads: unknown[] }) => column.leads.length === 0)).toBe(true);
  });

  it('applies the owner and contact filters', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await addLead(person, { contactId });
    await addLead(person, { contactId: await addContact(person) });
    const byContact = (await listLeads(person, `view=board&contactId=${contactId}`)).json();
    expect(byContact.columns[0].leadCount).toBe(1);
    const byStranger = (await listLeads(person, `view=board&ownerUserId=${randomUUID()}`)).json();
    expect(byStranger.columns[0].leadCount).toBe(0);
  });

  it('carries at most 50 leads per column and says there are more', async () => {
    const person = await createSignedInPerson(app, database);
    const accountId = person.profile.business.id;
    const newStageId = await stageIdNamed(person, 'New');
    for (let count = 0; count < 51; count += 1) {
      const contactId = randomUUID();
      await database.system
        .insertInto('contacts')
        .values({
          id: contactId,
          account_id: accountId,
          name: null,
          phone: null,
          email: `${contactId}@example.com`,
          language: null,
        })
        .execute();
      await database.system
        .insertInto('leads')
        .values({ id: randomUUID(), account_id: accountId, contact_id: contactId, stage_id: newStageId })
        .execute();
    }
    const column = (await listLeads(person, 'view=board')).json().columns[0];
    expect(column.leadCount).toBe(51);
    expect(column.leads).toHaveLength(50);
    expect(column.hasMore).toBe(true);
  });

  it("never shows another business's leads, and answers 401 with nobody signed in", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addLead(first, { contactId: await addContact(first) });
    expect((await listLeads(second, 'view=board')).json().columns[0].leadCount).toBe(0);
    expect((await listLeads(null, 'view=board')).statusCode).toBe(401);
  });
});

describe('the database rules behind the leads', () => {
  it('refuses an owner from another business even if the app code is bypassed', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await expect(
      database.system
        .insertInto('leads')
        .values({
          id: randomUUID(),
          account_id: person.profile.business.id,
          contact_id: contactId,
          stage_id: await stageIdNamed(person, 'New'),
          owner_user_id: stranger.profile.user.id,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('refuses two open leads for one contact even if the app code is bypassed', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person);
    await addLead(person, { contactId });
    await expect(
      database.system
        .insertInto('leads')
        .values({
          id: randomUUID(),
          account_id: person.profile.business.id,
          contact_id: contactId,
          stage_id: await stageIdNamed(person, 'Contacted'),
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('does not let the app role delete a lead', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = (await addLead(person, { contactId: await addContact(person) })).json();
    await expect(
      database.runInAccountTransaction(person.profile.business.id, (transaction) =>
        transaction.deleteFrom('leads').where('id', '=', lead.id).execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

/** Reads one lead as the person. */
const getLead = (person: SignedInPerson | null, leadId: string) => send(person, 'GET', `/leads/${leadId}`);

/** Changes a lead's details as the person. */
const patchLead = (person: SignedInPerson | null, leadId: string, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/leads/${leadId}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Adds a contact and a lead for it in one go, and returns the lead. */
async function addContactAndLead(person: SignedInPerson, body: Record<string, unknown> = {}) {
  const contactId = await addContact(person);
  const response = await addLead(person, { contactId, ...body });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

describe('GET /api/v1/leads/{id}', () => {
  it('reads one lead with its contact and stage', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Wedding in March', partySize: 120 });
    const response = await getLead(person, lead.id);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(lead);
    expect(response.json()).toMatchObject({
      contact: { name: 'Priya Menon' },
      stage: { name: 'New', kind: 'open' },
      interest: 'Wedding in March',
    });
  });

  it('reads a closed lead too, with its lost reason', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await closeLead(person, lead.id, 'Lost', 3);
    expect((await getLead(person, lead.id)).json()).toMatchObject({
      stage: { name: 'Lost', kind: 'lost' },
      lostReason: 'Too costly',
    });
  });

  it("answers 404 for another business's lead, a deleted lead, and an unknown id; 400 for a bad id", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await getLead(stranger, lead.id)).statusCode).toBe(404);
    expect((await getLead(person, randomUUID())).statusCode).toBe(404);
    expect((await getLead(person, 'abc')).statusCode).toBe(400);
    await database.system.updateTable('leads').set({ deleted_at: new Date() }).where('id', '=', lead.id).execute();
    expect((await getLead(person, lead.id)).statusCode).toBe(404);
  });

  it('lets ordinary staff read it, and answers 401 with nobody signed in', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await getLead(null, lead.id)).statusCode).toBe(401);
    await makeStaff(person);
    expect((await getLead(person, lead.id)).statusCode).toBe(200);
  });
});

describe('PATCH /api/v1/leads/{id}', () => {
  it('changes only the fields sent and leaves the rest', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Old words', partySize: 2, dateFrom: '2026-12-20' });
    const response = await patchLead(person, lead.id, {
      interest: '  New words  ',
      budgetPaise: 900_000,
      callbackAt: '2026-12-02T09:30:00Z',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      interest: 'New words',
      budgetPaise: 900_000,
      callbackAt: '2026-12-02T09:30:00.000Z',
      partySize: 2,
      dateFrom: '2026-12-20',
    });
    expect((await getLead(person, lead.id)).json()).toMatchObject({ interest: 'New words', partySize: 2 });
  });

  it('clears a field with null or blank text', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, {
      interest: 'Words',
      partySize: 4,
      promise: 'Call back',
      dateFrom: '2026-12-20',
    });
    const response = await patchLead(person, lead.id, { interest: '  ', partySize: null, promise: null, dateFrom: '' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ interest: null, partySize: null, promise: null, dateFrom: null });
  });

  it('judges the dates against what the lead holds, not only what was sent', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { dateFrom: '2026-12-20', dateTo: '2026-12-23' });
    const tooEarly = await patchLead(person, lead.id, { dateTo: '2026-12-10' });
    expect(tooEarly.statusCode).toBe(400);
    expect(tooEarly.json().error.code).toBe('INVALID_DATES');
    const tooLate = await patchLead(person, lead.id, { dateFrom: '2026-12-30' });
    expect(tooLate.statusCode).toBe(400);
    expect((await getLead(person, lead.id)).json()).toMatchObject({ dateFrom: '2026-12-20', dateTo: '2026-12-23' });
    // Moving both together is fine, and so is clearing the start date
    expect((await patchLead(person, lead.id, { dateFrom: '2026-12-30', dateTo: '2027-01-02' })).statusCode).toBe(200);
    expect((await patchLead(person, lead.id, { dateFrom: null })).statusCode).toBe(200);
  });

  it('changes nothing, writes no log line and no event, when the values are already stored', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Same', callbackAt: '2026-12-02T09:30:00Z' });
    const response = await patchLead(person, lead.id, {
      interest: 'Same',
      callbackAt: '2026-12-02T09:30:00Z',
      partySize: null,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().updatedAt).toBe(lead.updatedAt);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.updated')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('does not move the last-activity time, so the board order stays put', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await patchLead(person, lead.id, { interest: 'Edited' });
    expect((await getLead(person, lead.id)).json().lastActivityAt).toBe(lead.lastActivityAt);
  });

  it('edits a closed lead too', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await closeLead(person, lead.id, 'Won', 2);
    expect((await patchLead(person, lead.id, { interest: 'Booked: 3 rooms' })).statusCode).toBe(200);
  });

  it('records who did it and the field names only, never the words', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await patchLead(person, lead.id, { interest: 'Secret-new-words', partySize: 9 });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.updated')
      .executeTakeFirstOrThrow();
    expect(logLine.actor).toEqual({ kind: 'user', id: person.profile.user.id });
    expect([...logLine.fields].sort()).toEqual(['interest', 'partySize']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lead.updated')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ leadId: lead.id, fields: ['interest', 'partySize'] });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-new-words');
    const stored = await database.system
      .selectFrom('leads')
      .select('updated_by')
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(stored.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('keeps both changes when two edits to different fields arrive at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const responses = await Promise.all([
      patchLead(person, lead.id, { interest: 'From the first edit' }),
      patchLead(person, lead.id, { promise: 'From the second edit' }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect((await getLead(person, lead.id)).json()).toMatchObject({
      interest: 'From the first edit',
      promise: 'From the second edit',
    });
  });

  it("answers 404 for another business's lead, a deleted lead, and an unknown id, changing nothing", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Mine' });
    expect((await patchLead(stranger, lead.id, { interest: 'Hacked' })).statusCode).toBe(404);
    expect((await patchLead(person, randomUUID(), { interest: 'Nobody' })).statusCode).toBe(404);
    expect((await getLead(person, lead.id)).json().interest).toBe('Mine');
    await database.system.updateTable('leads').set({ deleted_at: new Date() }).where('id', '=', lead.id).execute();
    expect((await patchLead(person, lead.id, { interest: 'Late' })).statusCode).toBe(404);
  });

  it('lets ordinary staff edit', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await makeStaff(person);
    expect((await patchLead(person, lead.id, { interest: 'By staff' })).statusCode).toBe(200);
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Untouched' });
    expect((await patchLead(null, lead.id, { interest: 'X' })).statusCode).toBe(401);
    expect((await patchLead(person, lead.id, { interest: 'X' }, false)).statusCode).toBe(403);
    expect((await getLead(person, lead.id)).json().interest).toBe('Untouched');
  });

  it('answers 400 for an empty body, a bad id, bad values, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Untouched' });
    const nothing = await patchLead(person, lead.id, {});
    expect(nothing.statusCode).toBe(400);
    expect(nothing.json().error.code).toBe('NOTHING_TO_CHANGE');
    expect((await patchLead(person, 'abc', { interest: 'X' })).statusCode).toBe(400);
    const badBodies: unknown[] = [
      { dateFrom: '20/12/2026' },
      { dateFrom: '2026-02-31' },
      { partySize: 0 },
      { partySize: 2.5 },
      { budgetPaise: -5 },
      { budgetPaise: 2_000_000_000_000 },
      { callbackAt: 'soon' },
      { interest: 'x'.repeat(1001) },
      { promise: 'x'.repeat(501) },
      { stageId: randomUUID() },
      { ownerUserId: randomUUID() },
      { temperature: 'hot' },
      { contactId: randomUUID() },
      { firstChannel: 'phone' },
      { accountId: randomUUID() },
    ];
    for (const body of badBodies) {
      expect((await patchLead(person, lead.id, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await getLead(person, lead.id)).json().interest).toBe('Untouched');
  });
});

/** Moves a lead as the person. */
const moveLead = (person: SignedInPerson | null, leadId: string, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', `/leads/${leadId}/move`, body, withCsrfHeaders);

/** Changes a lead's owner as the person. */
const assignLead = (person: SignedInPerson | null, leadId: string, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', `/leads/${leadId}/assign`, body, withCsrfHeaders);

/** The contact's lifecycle stage, read through the real route. */
async function lifecycleStageOf(person: SignedInPerson, contactId: string): Promise<string> {
  return (await send(person, 'GET', `/contacts/${contactId}`)).json().lifecycleStage;
}

describe('POST /api/v1/leads/{id}/move', () => {
  it('moves a lead between open stages and counts the move as activity', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const response = await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Contacted') });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      stage: { name: 'Contacted', kind: 'open' },
      closedAt: null,
      lostReason: null,
    });
    expect(new Date(response.json().lastActivityAt).getTime()).toBeGreaterThan(new Date(lead.lastActivityAt).getTime());
    const board = (await listLeads(person, 'view=board')).json();
    expect(board.columns.map((column: { leadCount: number }) => column.leadCount)).toEqual([0, 1, 0, 0, 0]);
  });

  it('closes a lead that is won, and makes its contact a customer', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Won') });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ stage: { kind: 'won' }, lostReason: null });
    expect(response.json().closedAt).not.toBeNull();
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('customer');
  });

  it('makes a contact with two won leads a repeat customer', async () => {
    const person = await createSignedInPerson(app, database);
    const first = await addContactAndLead(person);
    await moveLead(person, first.id, { stageId: await stageIdNamed(person, 'Won') });
    const second = (await addLead(person, { contactId: first.contactId })).json();
    await moveLead(person, second.id, { stageId: await stageIdNamed(person, 'Won') });
    expect(await lifecycleStageOf(person, first.contactId)).toBe('repeat_customer');
  });

  it('needs a reason to move a lead to Lost, and stores it as the business wrote it', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const lostStageId = await stageIdNamed(person, 'Lost');

    const missing = await moveLead(person, lead.id, { stageId: lostStageId });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('LOST_REASON_REQUIRED');
    const unknown = await moveLead(person, lead.id, { stageId: lostStageId, lostReason: 'Bad weather' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('INVALID_LOST_REASON');
    expect((await getLead(person, lead.id)).json().stage.name).toBe('New');

    const response = await moveLead(person, lead.id, { stageId: lostStageId, lostReason: '  TOO COSTLY ' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ stage: { kind: 'lost' }, lostReason: 'Too costly' });
    expect(response.json().closedAt).not.toBeNull();
    // A lost lead is not an open lead, and nothing was won: the contact is just new again
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('new');
  });

  it('refuses a lost reason for any other stage', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await moveLead(person, lead.id, {
      stageId: await stageIdNamed(person, 'Contacted'),
      lostReason: 'Too costly',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('LOST_REASON_NOT_ALLOWED');
  });

  it('keeps the words a lead was lost with when the business later changes its reasons', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Lost'), lostReason: 'No reply' });
    await send(person, 'PUT', '/lost-reasons', { reasons: ['Something else'] });
    expect((await getLead(person, lead.id)).json().lostReason).toBe('No reply');
  });

  it('reopens a closed lead when it is moved to an open stage', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Lost'), lostReason: 'No reply' });
    const response = await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'New') });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ stage: { name: 'New' }, closedAt: null, lostReason: null });
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('lead');
    const reopenedEvents = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lead.reopened')
      .execute();
    expect(reopenedEvents.map((event) => event.payload)).toEqual([{ leadId: lead.id, contactId: lead.contactId }]);
  });

  it('can change a won lead to lost, with a reason', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Won') });
    const response = await moveLead(person, lead.id, {
      stageId: await stageIdNamed(person, 'Lost'),
      lostReason: 'Other',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().stage.kind).toBe('lost');
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('new');
  });

  it('refuses to reopen a lead when the person has another open lead, naming that lead', async () => {
    const person = await createSignedInPerson(app, database);
    const oldLead = await addContactAndLead(person);
    await closeLead(person, oldLead.id, 'Lost', 61);
    const newLead = (await addLead(person, { contactId: oldLead.contactId })).json();
    const response = await moveLead(person, oldLead.id, { stageId: await stageIdNamed(person, 'Contacted') });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'LEAD_OPEN', details: { leadId: newLead.id } });
    expect((await getLead(person, oldLead.id)).json().stage.kind).toBe('lost');
  });

  it('changes nothing when the lead is moved to the stage it is already in', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'New') });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(lead);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.moved')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('records who did it: the log line names the fields, the events carry ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const newStageId = await stageIdNamed(person, 'New');
    const lostStageId = await stageIdNamed(person, 'Lost');
    await moveLead(person, lead.id, { stageId: lostStageId, lostReason: 'Went elsewhere' });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.moved')
      .executeTakeFirstOrThrow();
    expect(logLine.actor).toEqual({ kind: 'user', id: person.profile.user.id });
    expect([...logLine.fields].sort()).toEqual(['lostReason', 'stageId']);
    const events = await database.system
      .selectFrom('domain_events')
      .select(['name', 'payload'])
      .where('account_id', '=', person.profile.business.id)
      .where('name', 'in', ['lead.moved', 'lead.lost', 'lead.won', 'lead.reopened'])
      .execute();
    expect(events.map((event) => event.name).sort()).toEqual(['lead.lost', 'lead.moved']);
    expect(events.find((event) => event.name === 'lead.moved')?.payload).toEqual({
      leadId: lead.id,
      fromStageId: newStageId,
      toStageId: lostStageId,
    });
    expect(JSON.stringify(events) + JSON.stringify(logLine)).not.toContain('Went elsewhere');
    const stored = await database.system
      .selectFrom('leads')
      .select('updated_by')
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(stored.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('takes turns when two moves arrive at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const contactedId = await stageIdNamed(person, 'Contacted');
    const quotedId = await stageIdNamed(person, 'Quoted');
    const responses = await Promise.all([
      moveLead(person, lead.id, { stageId: contactedId }),
      moveLead(person, lead.id, { stageId: quotedId }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect([contactedId, quotedId]).toContain((await getLead(person, lead.id)).json().stage.id);
  });

  it("answers 404 for another business's lead or stage, a deleted lead, and unknown ids; changes nothing", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const strangersLead = await addContactAndLead(stranger);
    const contactedId = await stageIdNamed(person, 'Contacted');
    expect((await moveLead(stranger, lead.id, { stageId: await stageIdNamed(stranger, 'Contacted') })).statusCode).toBe(
      404,
    );
    expect((await moveLead(person, lead.id, { stageId: await stageIdNamed(stranger, 'Contacted') })).statusCode).toBe(
      404,
    );
    expect((await moveLead(person, lead.id, { stageId: randomUUID() })).statusCode).toBe(404);
    expect((await moveLead(person, randomUUID(), { stageId: contactedId })).statusCode).toBe(404);
    expect((await getLead(person, lead.id)).json().stage.name).toBe('New');
    expect((await getLead(stranger, strangersLead.id)).json().stage.name).toBe('New');
    await database.system.updateTable('leads').set({ deleted_at: new Date() }).where('id', '=', lead.id).execute();
    expect((await moveLead(person, lead.id, { stageId: contactedId })).statusCode).toBe(404);
  });

  it('lets ordinary staff move leads', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await makeStaff(person);
    expect((await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Contacted') })).statusCode).toBe(
      200,
    );
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const body = { stageId: await stageIdNamed(person, 'Contacted') };
    expect((await moveLead(null, lead.id, body)).statusCode).toBe(401);
    expect((await moveLead(person, lead.id, body, false)).statusCode).toBe(403);
    expect((await getLead(person, lead.id)).json().stage.name).toBe('New');
  });

  it('answers 400 for a missing or bad stage id, a bad lead id, a too long reason, or an unknown field', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const lostStageId = await stageIdNamed(person, 'Lost');
    const badBodies: unknown[] = [
      {},
      { stageId: 'abc' },
      { stageId: lostStageId, lostReason: 'x'.repeat(81) },
      { stageId: lostStageId, lostReason: 5 },
      { stageId: lostStageId, lostReason: 'No reply', closedAt: '2026-01-01T00:00:00Z' },
      { stageId: lostStageId, lostReason: 'No reply', ownerUserId: randomUUID() },
    ];
    for (const body of badBodies) {
      expect((await moveLead(person, lead.id, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await moveLead(person, 'abc', { stageId: lostStageId })).statusCode).toBe(400);
    expect((await getLead(person, lead.id)).json().stage.name).toBe('New');
  });
});

describe('POST /api/v1/leads/{id}/assign', () => {
  /** Adds a second person to the business straight into the database (the team screens come with F02). */
  async function addColleague(person: SignedInPerson): Promise<string> {
    const userId = randomUUID();
    await database.system
      .insertInto('users')
      .values({
        id: userId,
        account_id: person.profile.business.id,
        email: `colleague-${userId.slice(0, 8)}@example.com`,
        name: 'Rahul Kumar',
        mobile_e164: null,
        mobile_key: null,
        role: 'staff',
      })
      .execute();
    return userId;
  }

  it('gives the lead to a colleague and back, and leaves the last-activity time alone', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const lead = await addContactAndLead(person);
    const response = await assignLead(person, lead.id, { ownerUserId: colleagueId });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ ownerUserId: colleagueId, lastActivityAt: lead.lastActivityAt });
    const mine = await listLeads(person, `ownerUserId=${colleagueId}`);
    expect(mine.json().total).toBe(1);
    const back = await assignLead(person, lead.id, { ownerUserId: person.profile.user.id });
    expect(back.json().ownerUserId).toBe(person.profile.user.id);
  });

  it('can leave a lead with nobody', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await assignLead(person, lead.id, { ownerUserId: null });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().ownerUserId).toBeNull();
  });

  it('changes nothing, with no log line or event, when the owner is already that person', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await assignLead(person, lead.id, { ownerUserId: person.profile.user.id });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(lead);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.assigned')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('answers 404 for a person from another business or an unknown person, and the owner stays', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    for (const ownerUserId of [stranger.profile.user.id, randomUUID()]) {
      expect((await assignLead(person, lead.id, { ownerUserId })).statusCode, ownerUserId).toBe(404);
    }
    expect((await getLead(person, lead.id)).json().ownerUserId).toBe(person.profile.user.id);
  });

  it("answers 404 for another business's lead and a deleted lead", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await assignLead(stranger, lead.id, { ownerUserId: null })).statusCode).toBe(404);
    expect((await assignLead(person, randomUUID(), { ownerUserId: null })).statusCode).toBe(404);
    expect((await getLead(person, lead.id)).json().ownerUserId).toBe(person.profile.user.id);
    await database.system.updateTable('leads').set({ deleted_at: new Date() }).where('id', '=', lead.id).execute();
    expect((await assignLead(person, lead.id, { ownerUserId: null })).statusCode).toBe(404);
  });

  it('records who did it, with ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const lead = await addContactAndLead(person);
    await assignLead(person, lead.id, { ownerUserId: colleagueId });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.assigned')
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({ fields: ['ownerUserId'], actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lead.assigned')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({
      leadId: lead.id,
      ownerUserId: colleagueId,
      previousOwnerUserId: person.profile.user.id,
    });
  });

  it('lets ordinary staff assign', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await makeStaff(person);
    expect((await assignLead(person, lead.id, { ownerUserId: null })).statusCode).toBe(200);
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await assignLead(null, lead.id, { ownerUserId: null })).statusCode).toBe(401);
    expect((await assignLead(person, lead.id, { ownerUserId: null }, false)).statusCode).toBe(403);
    expect((await getLead(person, lead.id)).json().ownerUserId).toBe(person.profile.user.id);
  });

  it('answers 400 for a missing or bad owner, a bad lead id, or an unknown field', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const badBodies: unknown[] = [
      {},
      { ownerUserId: 'abc' },
      { ownerUserId: 5 },
      { ownerUserId: null, stageId: randomUUID() },
    ];
    for (const body of badBodies) {
      expect((await assignLead(person, lead.id, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await assignLead(person, 'abc', { ownerUserId: null })).statusCode).toBe(400);
  });
});

describe('taking the "not a fit" mark off a contact that has leads', () => {
  /** Runs the event dispatcher until the given condition holds (the leads module reacts to the event a moment later). */
  async function dispatchUntil(condition: () => Promise<boolean>) {
    const dispatcher = createEventDispatcher({
      database,
      registry: createRegistry(modules),
      gate: { isActive: async () => true },
      contextFor: createContextFactory(database),
      logger: pino({ level: 'silent' }),
    });
    await waitFor(async () => {
      await dispatcher.dispatchPendingEventsOnce();
      return condition();
    });
  }

  /** Marks or unmarks a contact as "not a fit" through the real route. */
  const setNotAFit = (person: SignedInPerson, contactId: string, notAFit: boolean) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contactId}`,
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
      payload: { notAFit },
    });

  it('puts the contact back to lead once the leads module has looked at its leads', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await setNotAFit(person, lead.contactId, true)).json().lifecycleStage).toBe('not_a_fit');
    // The answer comes straight away with the plain result; the leads module corrects it from the event
    expect((await setNotAFit(person, lead.contactId, false)).json().lifecycleStage).toBe('new');
    await dispatchUntil(async () => (await lifecycleStageOf(person, lead.contactId)) === 'lead');
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('lead');
  });

  it('puts the contact back to customer when it has a won lead', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Won') });
    await setNotAFit(person, lead.contactId, true);
    await setNotAFit(person, lead.contactId, false);
    await dispatchUntil(async () => (await lifecycleStageOf(person, lead.contactId)) === 'customer');
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('customer');
  });
});

/** Deletes a lead as the person. */
const deleteLead = (person: SignedInPerson | null, leadId: string, withCsrfHeaders = true) =>
  send(person, 'DELETE', `/leads/${leadId}`, undefined, withCsrfHeaders);

describe('DELETE /api/v1/leads/{id}', () => {
  it('hides the lead everywhere but keeps its row', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const response = await deleteLead(person, lead.id);
    expect(response.statusCode, response.body).toBe(204);
    expect(response.body).toBe('');

    expect((await getLead(person, lead.id)).statusCode).toBe(404);
    expect((await listLeads(person)).json().total).toBe(0);
    expect((await listLeads(person, 'view=board')).json().columns[0].leadCount).toBe(0);
    const pipeline = (await send(person, 'GET', '/pipeline')).json();
    expect(pipeline.stages.find((stage: { name: string }) => stage.name === 'New').leadCount).toBe(0);

    const row = await database.system
      .selectFrom('leads')
      .select(['deleted_at', 'updated_by'])
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it("works the contact's stage out again without the lead, and lets the contact have a new lead", async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('lead');
    await deleteLead(person, lead.id);
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('new');
    const newLead = await addLead(person, { contactId: lead.contactId });
    expect(newLead.statusCode, newLead.body).toBe(201);
    expect(newLead.json().id).not.toBe(lead.id);
  });

  it('takes a customer back to new when its only won lead is deleted', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    await moveLead(person, lead.id, { stageId: await stageIdNamed(person, 'Won') });
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('customer');
    await deleteLead(person, lead.id);
    expect(await lifecycleStageOf(person, lead.contactId)).toBe('new');
  });

  it('answers 404 the second time, for another business, and for an unknown id', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await deleteLead(stranger, lead.id)).statusCode).toBe(404);
    expect((await getLead(person, lead.id)).statusCode).toBe(200);
    expect((await deleteLead(person, randomUUID())).statusCode).toBe(404);
    expect((await deleteLead(person, lead.id)).statusCode).toBe(204);
    expect((await deleteLead(person, lead.id)).statusCode).toBe(404);
  });

  it('lets only one of two simultaneous deletes succeed', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    const responses = await Promise.all([deleteLead(person, lead.id), deleteLead(person, lead.id)]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 404]);
  });

  it('records who did it, with ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person, { interest: 'Secret-interest-words' });
    await deleteLead(person, lead.id);
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.deleted')
      .executeTakeFirstOrThrow();
    expect(logLine.actor).toEqual({ kind: 'user', id: person.profile.user.id });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lead.deleted')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ leadId: lead.id, contactId: lead.contactId });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-interest-words');
  });

  it('answers 401 with nobody signed in, 403 to staff and without the web app headers, 400 for a bad id', async () => {
    const person = await createSignedInPerson(app, database);
    const lead = await addContactAndLead(person);
    expect((await deleteLead(null, lead.id)).statusCode).toBe(401);
    expect((await deleteLead(person, lead.id, false)).statusCode).toBe(403);
    expect((await deleteLead(person, 'abc')).statusCode).toBe(400);
    await makeStaff(person);
    expect((await deleteLead(person, lead.id)).statusCode).toBe(403);
    expect((await getLead(person, lead.id)).statusCode).toBe(200);
  });
});

describe('the "own leads only" role (staff_own)', () => {
  /** Adds a second person to the business straight into the database (the team screens come with F02). */
  async function addColleague(person: SignedInPerson): Promise<string> {
    const userId = randomUUID();
    await database.system
      .insertInto('users')
      .values({
        id: userId,
        account_id: person.profile.business.id,
        email: `colleague-${userId.slice(0, 8)}@example.com`,
        name: 'Rahul Kumar',
        mobile_e164: null,
        mobile_key: null,
        role: 'staff',
      })
      .execute();
    return userId;
  }

  /** Changes the person's role (it is read from the database on every request). */
  async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
    await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
  }

  /** Sets up a business with three leads: one owned by the person, one by a colleague, one by nobody. */
  async function setUp() {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const own = await addContactAndLead(person); // the sharing-out rule gives it to the person
    const colleaguesLead = await addContactAndLead(person);
    await assignLead(person, colleaguesLead.id, { ownerUserId: colleagueId });
    const unassignedLead = await addContactAndLead(person);
    await assignLead(person, unassignedLead.id, { ownerUserId: null });
    return { person, colleagueId, own, colleaguesLead, unassignedLead };
  }

  it('lists, counts and shows only the leads the person owns', async () => {
    const { person, own, colleaguesLead } = await setUp();
    expect((await listLeads(person)).json().total).toBe(3); // as a manager: all three
    await setRole(person, 'staff_own');

    const list = (await listLeads(person)).json();
    expect(list.total).toBe(1);
    expect(list.items.map((lead: { id: string }) => lead.id)).toEqual([own.id]);

    const board = (await listLeads(person, 'view=board')).json();
    expect(board.columns[0].leadCount).toBe(1);
    expect(board.columns[0].leads.map((lead: { id: string }) => lead.id)).toEqual([own.id]);

    const pipeline = (await send(person, 'GET', '/pipeline')).json();
    expect(pipeline.stages.find((stage: { name: string }) => stage.name === 'New').leadCount).toBe(1);

    // Asking for someone else's leads, or for a colleague's contact, finds nothing
    expect((await listLeads(person, `ownerUserId=${randomUUID()}`)).json().total).toBe(0);
    expect((await listLeads(person, `contactId=${colleaguesLead.contactId}`)).json().total).toBe(0);
  });

  it("answers 404 to everything that names another person's lead or an unowned lead, even by typed URL", async () => {
    const { person, colleaguesLead, unassignedLead, own } = await setUp();
    await setRole(person, 'staff_own');
    const contactedId = await stageIdNamed(person, 'Contacted');
    for (const lead of [colleaguesLead, unassignedLead]) {
      expect((await getLead(person, lead.id)).statusCode, 'read').toBe(404);
      expect((await patchLead(person, lead.id, { interest: 'Taken over' })).statusCode, 'edit').toBe(404);
      expect((await moveLead(person, lead.id, { stageId: contactedId })).statusCode, 'move').toBe(404);
      expect((await assignLead(person, lead.id, { ownerUserId: person.profile.user.id })).statusCode, 'take over').toBe(
        404,
      );
    }
    // ...and the lead was not touched
    await setRole(person, 'manager');
    expect((await getLead(person, colleaguesLead.id)).json()).toMatchObject({
      stage: { name: 'New' },
      interest: colleaguesLead.interest,
    });
    expect((await getLead(person, unassignedLead.id)).json().ownerUserId).toBeNull();

    // Their own lead works as normal
    await setRole(person, 'staff_own');
    expect((await getLead(person, own.id)).statusCode).toBe(200);
    expect((await patchLead(person, own.id, { interest: 'Mine' })).statusCode).toBe(200);
    expect((await moveLead(person, own.id, { stageId: contactedId })).statusCode).toBe(200);
  });

  it('adds leads only in their own name', async () => {
    const { person, colleagueId } = await setUp();
    await setRole(person, 'staff_own');
    const mine = await addLead(person, { contactId: await addContact(person) });
    expect(mine.statusCode, mine.body).toBe(201);
    expect(mine.json().ownerUserId).toBe(person.profile.user.id);
    const forSomeoneElse = await addLead(person, { contactId: await addContact(person), ownerUserId: colleagueId });
    expect(forSomeoneElse.statusCode).toBe(403);
    const namingThemselves = await addLead(person, {
      contactId: await addContact(person),
      ownerUserId: person.profile.user.id,
    });
    expect(namingThemselves.statusCode).toBe(201);
  });

  it('loses sight of a lead they give to someone else, and cannot delete leads at all', async () => {
    const { person, colleagueId, own } = await setUp();
    await setRole(person, 'staff_own');
    expect((await deleteLead(person, own.id)).statusCode).toBe(403);
    expect((await assignLead(person, own.id, { ownerUserId: colleagueId })).statusCode).toBe(200);
    expect((await getLead(person, own.id)).statusCode).toBe(404);
    expect((await listLeads(person)).json().total).toBe(0);
    // The manager still sees it, now owned by the colleague
    await setRole(person, 'manager');
    expect((await getLead(person, own.id)).json().ownerUserId).toBe(colleagueId);
  });

  it("does not change what staff and managers see: all of the business's leads", async () => {
    const { person } = await setUp();
    await setRole(person, 'staff');
    expect((await listLeads(person)).json().total).toBe(3);
    expect((await listLeads(person, 'view=board')).json().columns[0].leadCount).toBe(3);
  });
});
