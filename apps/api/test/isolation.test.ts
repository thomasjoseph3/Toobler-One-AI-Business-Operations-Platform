import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// The shared isolation suite (docs/SECURITY.md, BACKEND.md): one place that proves business B can never reach business A's
// data through ANY route, and that fails when someone adds a route without deciding how it is kept apart.
//
// Three checks:
//  1. THE REGISTER. Every route in the API's own OpenAPI document must be listed here: either with an attempt by business B
//     (named below), or on the exemption list with the reason it holds no business data. A new route that is in neither
//     fails this test, so nobody can forget it.
//  2. THE ATTEMPTS. Business B signs in and tries each route against A's ids (in the address, in the body, in the query) and
//     reads every list. Each answers 404 (or 400/403 where the route is stricter), no list shows A's data, and afterwards
//     A's data is exactly as it was.
//  3. THE DATABASE. For every table that has an account_id, a connection fenced to B sees none of A's rows.

const DOCS_ORIGIN = 'http://localhost:4000';

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  // Built like the development app, so it serves the OpenAPI document that lists every route
  app = await buildTestApp(database, [], { config: { ...testConfig(), env: 'development', docsOrigin: DOCS_ORIGIN } });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (person: SignedInPerson | null, method: string, url: string, payload?: unknown) =>
  app.inject({
    method: method as 'GET',
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Sends a request that must succeed and returns its body. */
async function sendOk(person: SignedInPerson, method: string, url: string, payload?: unknown, status = 200) {
  const response = await send(person, method, url, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return response.statusCode === 204 ? undefined : response.json();
}

/** Everything business A owns that business B will aim at. */
interface BusinessAData {
  contactId: string;
  leadId: string;
  ticketId: string;
  stageId: string;
  offeringId: string;
  offerId: string;
  userId: string;
  secretWords: string;
}

/** What B owns, for the attempts that mix B's own records with A's ids. */
interface BusinessBData {
  contactId: string;
  leadId: string;
  stageId: string;
}

let businessA: SignedInPerson;
let businessB: SignedInPerson;
let dataOfA: BusinessAData;
let dataOfB: BusinessBData;

beforeAll(async () => {
  businessA = await createSignedInPerson(app, database);
  businessB = await createSignedInPerson(app, database);

  const secretWords = `secret-${randomUUID().slice(0, 8)}`;
  const contact = await sendOk(
    businessA,
    'POST',
    '/contacts',
    { name: `Alice ${secretWords}`, phone: uniqueUaeNumber() },
    201,
  );
  const lead = await sendOk(businessA, 'POST', '/leads', { contactId: contact.id, interest: secretWords }, 201);
  const ticket = await sendOk(businessA, 'POST', '/tickets', { contactId: contact.id, title: secretWords }, 201);
  const stage = await sendOk(businessA, 'POST', '/pipeline/stages', { name: `Stage ${secretWords}` }, 201);
  await sendOk(businessA, 'PUT', '/knowledge/answers/business_name', { value: `Business ${secretWords}` });
  await sendOk(businessA, 'PUT', '/knowledge/situations/discount_request', { choice: 'tell_current_offer' });
  await sendOk(businessA, 'PUT', '/knowledge/settings', { timeZone: 'Asia/Dubai', defaultCountry: 'AE' });
  const offering = await sendOk(
    businessA,
    'POST',
    '/offerings',
    { name: `Offering ${secretWords}`, fromPricePaise: 450_000, priceUnit: 'per night', gstMode: 'plus' },
    201,
  );
  const offer = await sendOk(businessA, 'POST', '/offers', { text: `Offer ${secretWords}`, endsOn: '2099-12-31' }, 201);
  // An answer of A's that is waiting for a manager's check (what the website reader will leave behind, F31)
  await database.system
    .insertInto('business_answers')
    .values({
      account_id: businessA.profile.business.id,
      question_key: 'address',
      value: JSON.stringify(`Address ${secretWords}`),
      source: 'website',
      status: 'check',
    })
    .execute();
  dataOfA = {
    contactId: contact.id,
    leadId: lead.id,
    ticketId: ticket.id,
    stageId: stage.id,
    offeringId: offering.id,
    offerId: offer.id,
    userId: businessA.profile.user.id,
    secretWords,
  };

  const bContact = await sendOk(businessB, 'POST', '/contacts', { name: 'Bob', phone: uniqueUaeNumber() }, 201);
  const bLead = await sendOk(businessB, 'POST', '/leads', { contactId: bContact.id }, 201);
  const bStage = await sendOk(businessB, 'POST', '/pipeline/stages', { name: 'Bob stage' }, 201);
  dataOfB = { contactId: bContact.id, leadId: bLead.id, stageId: bStage.id };
});

/** One thing business B tries against A's data, and what it must be told. */
interface Attempt {
  /** The route as the OpenAPI document spells it: METHOD and path. This is what the register matches. */
  route: string;
  /** What B is trying, in plain words. */
  what: string;
  /** Builds the request (it needs A's and B's ids, which exist only after the setup above). */
  request: () => { method: string; url: string; payload?: unknown };
  /** The answer that is right for this route. */
  expectedStatus: number;
}

const attempts: Attempt[] = [
  // ---- contacts
  {
    route: 'GET /api/v1/contacts/{id}',
    what: "read A's contact",
    request: () => ({ method: 'GET', url: `/contacts/${dataOfA.contactId}` }),
    expectedStatus: 404,
  },
  {
    route: 'PATCH /api/v1/contacts/{id}',
    what: "edit A's contact",
    request: () => ({ method: 'PATCH', url: `/contacts/${dataOfA.contactId}`, payload: { name: 'Hacked' } }),
    expectedStatus: 404,
  },
  {
    route: 'DELETE /api/v1/contacts/{id}',
    what: "delete A's contact",
    request: () => ({ method: 'DELETE', url: `/contacts/${dataOfA.contactId}` }),
    expectedStatus: 404,
  },
  // ---- leads
  {
    route: 'GET /api/v1/leads/{id}',
    what: "read A's lead",
    request: () => ({ method: 'GET', url: `/leads/${dataOfA.leadId}` }),
    expectedStatus: 404,
  },
  {
    route: 'PATCH /api/v1/leads/{id}',
    what: "edit A's lead",
    request: () => ({ method: 'PATCH', url: `/leads/${dataOfA.leadId}`, payload: { interest: 'Hacked' } }),
    expectedStatus: 404,
  },
  {
    route: 'DELETE /api/v1/leads/{id}',
    what: "delete A's lead",
    request: () => ({ method: 'DELETE', url: `/leads/${dataOfA.leadId}` }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/leads/{id}/move',
    what: "move A's lead (into B's own stage)",
    request: () => ({ method: 'POST', url: `/leads/${dataOfA.leadId}/move`, payload: { stageId: dataOfB.stageId } }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/leads/{id}/assign',
    what: "assign A's lead",
    request: () => ({ method: 'POST', url: `/leads/${dataOfA.leadId}/assign`, payload: { ownerUserId: null } }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/leads',
    what: "add a lead for A's contact",
    request: () => ({ method: 'POST', url: '/leads', payload: { contactId: dataOfA.contactId } }),
    expectedStatus: 404,
  },
  // ---- pipeline
  {
    route: 'PATCH /api/v1/pipeline/stages/{id}',
    what: "rename A's stage",
    request: () => ({ method: 'PATCH', url: `/pipeline/stages/${dataOfA.stageId}`, payload: { name: 'Hacked' } }),
    expectedStatus: 404,
  },
  {
    route: 'DELETE /api/v1/pipeline/stages/{id}',
    what: "remove A's stage",
    request: () => ({ method: 'DELETE', url: `/pipeline/stages/${dataOfA.stageId}` }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/pipeline/stages/reorder',
    what: "reorder using A's stage ids",
    request: () => ({ method: 'POST', url: '/pipeline/stages/reorder', payload: { stageIds: [dataOfA.stageId] } }),
    expectedStatus: 400,
  },
  // ---- sharing out new leads
  {
    route: 'PUT /api/v1/assignment-rules',
    what: "name A's person as the one who gets every new lead",
    request: () => ({
      method: 'PUT',
      url: '/assignment-rules',
      payload: { mode: 'one_person', userId: dataOfA.userId },
    }),
    expectedStatus: 404,
  },
  // ---- tickets
  {
    route: 'GET /api/v1/tickets/{id}',
    what: "read A's ticket",
    request: () => ({ method: 'GET', url: `/tickets/${dataOfA.ticketId}` }),
    expectedStatus: 404,
  },
  {
    route: 'PATCH /api/v1/tickets/{id}',
    what: "close A's ticket with a note",
    request: () => ({
      method: 'PATCH',
      url: `/tickets/${dataOfA.ticketId}`,
      payload: { status: 'done', note: 'Sneaky', ownerUserId: businessB.profile.user.id },
    }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/tickets',
    what: "raise a ticket for A's contact",
    request: () => ({ method: 'POST', url: '/tickets', payload: { contactId: dataOfA.contactId, title: 'Sneaky' } }),
    expectedStatus: 404,
  },
  // ---- the business profile (the question key is a code, not a business's record: B can only ever answer for B)
  {
    route: 'PUT /api/v1/knowledge/answers/{question_key}',
    what: "answer the same question as A, and A's answer must stay as it was",
    request: () => ({
      method: 'PUT',
      url: '/knowledge/answers/business_name',
      payload: { value: 'Bob Business' },
    }),
    expectedStatus: 200,
  },
  {
    route: 'PUT /api/v1/knowledge/situations/{key}',
    what: "choose another way for the same situation as A, and A's choice must stay as it was",
    request: () => ({
      method: 'PUT',
      url: '/knowledge/situations/discount_request',
      payload: { choice: 'prices_are_fixed' },
    }),
    expectedStatus: 200,
  },
  // ---- offerings
  {
    route: 'POST /api/v1/offerings/reorder',
    what: "reorder using A's offering id",
    request: () => ({ method: 'POST', url: '/offerings/reorder', payload: { offeringIds: [dataOfA.offeringId] } }),
    expectedStatus: 400,
  },
  {
    route: 'PATCH /api/v1/offers/{id}',
    what: "change A's offer",
    request: () => ({ method: 'PATCH', url: `/offers/${dataOfA.offerId}`, payload: { text: 'Hacked' } }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/offers',
    what: "add an offer (B's own business only)",
    request: () => ({ method: 'POST', url: '/offers', payload: { text: 'Bob offer', endsOn: '2099-12-31' } }),
    expectedStatus: 201,
  },
  {
    route: 'PATCH /api/v1/offerings/{id}',
    what: "change A's offering",
    request: () => ({
      method: 'PATCH',
      url: `/offerings/${dataOfA.offeringId}`,
      payload: { name: 'Hacked', active: false },
    }),
    expectedStatus: 404,
  },
  {
    route: 'DELETE /api/v1/offerings/{id}',
    what: "remove A's offering",
    request: () => ({ method: 'DELETE', url: `/offerings/${dataOfA.offeringId}` }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/offerings',
    what: "add an offering owned by A's person",
    request: () => ({
      method: 'POST',
      url: '/offerings',
      payload: { name: 'Sneaky offering', ownerUserId: dataOfA.userId },
    }),
    expectedStatus: 404,
  },
  {
    route: 'POST /api/v1/offerings',
    what: "add an offering of its own (B's own business only), and A's list must stay as it was",
    request: () => ({
      method: 'POST',
      url: '/offerings',
      payload: { name: 'Bob offering' },
    }),
    expectedStatus: 201,
  },
  {
    route: 'PUT /api/v1/knowledge/settings',
    what: "change the time zone and country (B's own business only), and A's must stay as they were",
    request: () => ({
      method: 'PUT',
      url: '/knowledge/settings',
      payload: { timeZone: 'Europe/London', defaultCountry: 'GB' },
    }),
    expectedStatus: 200,
  },
  {
    route: 'POST /api/v1/knowledge/answers/confirm',
    what: "confirm A's answer that is waiting for a check (B has no such answer)",
    request: () => ({ method: 'POST', url: '/knowledge/answers/confirm', payload: { questionKeys: ['address'] } }),
    expectedStatus: 404,
  },
  // ---- the platform (only a platform admin; B is an ordinary business)
  {
    route: 'POST /api/v1/platform/businesses/{id}/modules',
    what: "put a module into A's plan",
    request: () => ({
      method: 'POST',
      url: `/platform/businesses/${businessA.profile.business.id}/modules`,
      payload: { moduleId: 'channel.whatsapp', entitled: true },
    }),
    expectedStatus: 403,
  },
];

/** Lists B reads. Each must show none of A's ids or words. */
const listsBReads: Array<{ route: string; url: string }> = [
  { route: 'GET /api/v1/contacts', url: '/contacts?limit=100' },
  { route: 'GET /api/v1/leads', url: '/leads?limit=100' },
  { route: 'GET /api/v1/leads', url: '/leads?view=board' },
  { route: 'GET /api/v1/tickets', url: '/tickets?limit=100' },
  { route: 'GET /api/v1/pipeline', url: '/pipeline' },
  { route: 'GET /api/v1/lost-reasons', url: '/lost-reasons' },
  { route: 'GET /api/v1/assignment-rules', url: '/assignment-rules' },
  { route: 'GET /api/v1/modules', url: '/modules' },
  { route: 'GET /api/v1/knowledge/questions', url: '/knowledge/questions' },
  { route: 'GET /api/v1/knowledge/situations', url: '/knowledge/situations' },
  { route: 'GET /api/v1/knowledge/settings', url: '/knowledge/settings' },
  { route: 'GET /api/v1/offerings', url: '/offerings' },
  { route: 'GET /api/v1/offers', url: '/offers?include=expired' },
  { route: 'GET /api/v1/me', url: '/me' },
];

/**
 * Routes that hold no business data by id, with the reason. Everything here either has no business data, or takes the
 * business only from the session, or is global. Adding a route to this list is a decision to be made on purpose.
 */
const exemptRoutes: Record<string, string> = {
  'POST /api/v1/auth/signup': 'creates a new business; nothing of another business is named',
  'POST /api/v1/auth/login': "checks the caller's own credentials",
  'POST /api/v1/auth/logout': "ends the caller's own session",
  'POST /api/v1/auth/refresh':
    "rotates the caller's own refresh token (a stolen old token ends the session; tested in auth-refresh)",
  'POST /api/v1/auth/verify-email': 'a one-time token, hashed, tied to one person (tested in auth-email-verification)',
  'POST /api/v1/auth/resend-email': 'acts on the signed-in caller only',
  'POST /api/v1/auth/forgot-password':
    'answers the same whether the email exists or not (tested in auth-password-reset)',
  'POST /api/v1/auth/reset-password': 'a one-time token tied to one person (tested in auth-password-reset)',
  'GET /api/v1/health': 'public, no data',
  'GET /api/v1/industries': 'a global list, the same for every business',
  'POST /api/v1/industries': 'platform admin only, adds to the global list (tested in industries-add)',
  'PATCH /api/v1/me': "changes the caller's own profile; the person comes from the session",
  'POST /api/v1/me/password': "changes the caller's own password; the person comes from the session",
  'PATCH /api/v1/modules/{id}':
    'the id is a global module code, not a business row; the business comes from the session (tested in modules)',
  'GET /api/v1/contacts': "covered by the list check (GET /contacts?limit=100 shows none of A's data)",
  'GET /api/v1/leads': 'covered by the list check',
  'GET /api/v1/tickets': 'covered by the list check',
  'GET /api/v1/pipeline': 'covered by the list check',
  'GET /api/v1/lost-reasons': 'covered by the list check',
  'GET /api/v1/assignment-rules': 'covered by the list check',
  'GET /api/v1/modules': 'covered by the list check',
  'GET /api/v1/knowledge/questions': 'covered by the list check',
  'GET /api/v1/knowledge/situations': 'covered by the list check',
  'GET /api/v1/knowledge/settings': 'covered by the list check',
  'GET /api/v1/offerings': 'covered by the list check',
  'GET /api/v1/offers': 'covered by the list check',
  'GET /api/v1/me': 'covered by the list check',
  'POST /api/v1/contacts':
    "creates in the caller's business; the business comes from the session only (the body schema refuses an accountId)",
  'POST /api/v1/pipeline/stages': "creates in the caller's business; same reason",
  'PUT /api/v1/lost-reasons': "replaces the caller's own list; takes no ids",
};

/** METHOD and path for every route in the OpenAPI document, as "GET /api/v1/contacts/{id}". */
async function readAllRoutes(): Promise<string[]> {
  const response = await app.inject({ url: '/docs/json' });
  expect(response.statusCode, response.body).toBe(200);
  const document = response.json() as { paths: Record<string, Record<string, unknown>> };
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter((method) => httpMethods.includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

describe('isolation: the register of routes', () => {
  it('has a decision for every route in the API: an attempt by the other business, or an exemption with a reason', async () => {
    const decided = new Set([...attempts.map((attempt) => attempt.route), ...Object.keys(exemptRoutes)]);
    const undecided = (await readAllRoutes()).filter((route) => !decided.has(route));
    expect(
      undecided,
      'A route was added without an isolation decision. Add an attempt for it in test/isolation.test.ts (what the OTHER ' +
        'business tries, and what it must be told) or, if it holds no business data, an entry in exemptRoutes with the reason.',
    ).toEqual([]);
  });

  it('does not list routes that no longer exist (so the register stays honest)', async () => {
    const real = new Set(await readAllRoutes());
    const stale = [...attempts.map((attempt) => attempt.route), ...Object.keys(exemptRoutes)].filter(
      (route) => !real.has(route),
    );
    expect(stale).toEqual([]);
  });

  it('never exempts a route that takes an id of a business record in its address without an attempt', async () => {
    // A path like /contacts/{id} names one business record, so it must have a real attempt, not an exemption
    const exemptWithAnId = Object.keys(exemptRoutes).filter(
      (route) => route.includes('{id}') && route !== 'PATCH /api/v1/modules/{id}',
    );
    expect(exemptWithAnId).toEqual([]);
  });
});

describe('isolation: business B tries to reach business A', () => {
  for (const attempt of attempts) {
    it(`${attempt.route}: B tries to ${attempt.what} and is told ${attempt.expectedStatus}`, async () => {
      const { method, url, payload } = attempt.request();
      const response = await send(businessB, method, url, payload);
      expect(response.statusCode, response.body).toBe(attempt.expectedStatus);
      // Whatever the refusal says, it must not repeat A's words
      expect(response.body).not.toContain(dataOfA.secretWords);
    });
  }

  it("shows B none of A's ids or words in any list", async () => {
    for (const list of listsBReads) {
      const response = await send(businessB, 'GET', list.url);
      expect(response.statusCode, `${list.url}: ${response.body}`).toBe(200);
      const body = response.body;
      for (const secret of [
        dataOfA.contactId,
        dataOfA.leadId,
        dataOfA.ticketId,
        dataOfA.stageId,
        dataOfA.secretWords,
        businessA.profile.business.id,
      ]) {
        expect(body, `${list.url} must not contain ${secret}`).not.toContain(secret);
      }
    }
  });

  it("leaves every one of A's records exactly as it was after all the attempts", async () => {
    const contact = await sendOk(businessA, 'GET', `/contacts/${dataOfA.contactId}`);
    expect(contact.name).toBe(`Alice ${dataOfA.secretWords}`);
    const lead = await sendOk(businessA, 'GET', `/leads/${dataOfA.leadId}`);
    expect(lead).toMatchObject({ interest: dataOfA.secretWords, stage: { name: 'New' } });
    const ticket = await sendOk(businessA, 'GET', `/tickets/${dataOfA.ticketId}`);
    expect(ticket).toMatchObject({ title: dataOfA.secretWords, status: 'open', ownerUserId: null, notes: [] });
    const pipeline = await sendOk(businessA, 'GET', '/pipeline');
    expect(pipeline.stages.map((stage: { id: string }) => stage.id)).toContain(dataOfA.stageId);
    expect(pipeline.stages.find((stage: { id: string }) => stage.id === dataOfA.stageId).name).toBe(
      `Stage ${dataOfA.secretWords}`,
    );
    const questions = await sendOk(businessA, 'GET', '/knowledge/questions');
    const nameAnswer = questions.questions.find((question: { key: string }) => question.key === 'business_name').answer;
    expect(nameAnswer.value).toBe(`Business ${dataOfA.secretWords}`);
    const addressAnswer = questions.questions.find((question: { key: string }) => question.key === 'address').answer;
    expect(addressAnswer).toMatchObject({ status: 'check', source: 'website' });
    const situations = await sendOk(businessA, 'GET', '/knowledge/situations');
    expect(situations.items.find((item: { key: string }) => item.key === 'discount_request').selectedChoiceKey).toBe(
      'tell_current_offer',
    );
    expect(await sendOk(businessA, 'GET', '/knowledge/settings')).toEqual({
      timeZone: 'Asia/Dubai',
      defaultCountry: 'AE',
    });
    const offeringsOfA = await sendOk(businessA, 'GET', '/offerings');
    expect(offeringsOfA.items).toHaveLength(1);
    expect(offeringsOfA.items[0]).toMatchObject({
      name: `Offering ${dataOfA.secretWords}`,
      priceInWords: 'from ₹4,500 a night plus GST',
    });
    const offersOfA = await sendOk(businessA, 'GET', '/offers');
    expect(offersOfA.items).toHaveLength(1);
    expect(offersOfA.items[0].text).toBe(`Offer ${dataOfA.secretWords}`);
    const rules = await sendOk(businessA, 'GET', '/assignment-rules');
    expect(JSON.stringify(rules)).toContain(dataOfA.userId); // still A's own manager
    // B's own records are untouched too
    expect((await sendOk(businessB, 'GET', `/leads/${dataOfB.leadId}`)).contactId).toBe(dataOfB.contactId);
  });

  it('answers a signed-out caller 401 on every attempt', async () => {
    for (const attempt of attempts) {
      const { method, url, payload } = attempt.request();
      const response = await send(null, method, url, payload);
      expect(response.statusCode, `${attempt.route}: ${response.body}`).toBe(401);
    }
  });
});

describe('isolation: the database itself', () => {
  it("shows a connection fenced to B none of A's rows in any table that has an account_id", async () => {
    const tables = await sql<{ table_name: string }>`
      select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'app' and c.column_name = 'account_id'
      order by c.table_name`.execute(database.system);
    expect(tables.rows.length).toBeGreaterThan(10);

    const accountOfA = businessA.profile.business.id;
    const rowsOfAThatBusinessBSees: Array<{ table: string; rows: number }> = [];
    let tablesWhereAHasRows = 0;
    for (const { table_name: tableName } of tables.rows) {
      const countForA = (connection: Database['system']) =>
        sql<{
          total: number;
        }>`select count(*)::int as total from app.${sql.id(tableName)} where account_id = ${accountOfA}`
          .execute(connection)
          .then((result) => result.rows[0]!.total);
      const rowsOfA = await countForA(database.system);
      if (rowsOfA > 0) tablesWhereAHasRows += 1;
      const rowsSeenByB = await database.runInAccountTransaction(businessB.profile.business.id, countForA);
      if (rowsSeenByB !== 0) rowsOfAThatBusinessBSees.push({ table: tableName, rows: rowsSeenByB });
    }
    expect(rowsOfAThatBusinessBSees).toEqual([]);
    // The check means something only if A really has rows in many of those tables
    expect(tablesWhereAHasRows).toBeGreaterThan(8);
  });
});
