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
  method: 'GET' | 'POST' | 'DELETE',
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
    expect(event.payload).toEqual({ leadId: lead.id, contactId, ownerUserId: person.profile.user.id });
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
