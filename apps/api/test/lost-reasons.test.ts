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

/** Reads the lost reasons as the person (or as nobody). */
const getLostReasons = (person: SignedInPerson | null) =>
  app.inject({ url: '/api/v1/lost-reasons', headers: person ? { cookie: person.cookieHeader } : {} });

/** Replaces the lost reasons as the person, with the headers the web app sends. */
const putLostReasons = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/lost-reasons',
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

/** The labels of a lost-reasons answer, in the order they came. */
const labelsOf = (body: { items: Array<{ label: string }> }) => body.items.map((item) => item.label);

describe('GET /api/v1/lost-reasons', () => {
  it('gives a new business the five starting reasons in order', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await getLostReasons(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(labelsOf(response.json())).toEqual([
      'Too costly',
      'Went elsewhere',
      'Dates not available',
      'No reply',
      'Other',
    ]);
    expect(response.json().items.map((item: { sort: number }) => item.sort)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.keys(response.json().items[0]).sort()).toEqual(['id', 'label', 'sort']);
  });

  it('lets ordinary staff read it (they need it for the Lost dialog)', async () => {
    const person = await createSignedInPerson(app, database);
    await makeStaff(person);
    expect((await getLostReasons(person)).statusCode).toBe(200);
  });

  it("never shows another business's reasons", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await putLostReasons(first, { reasons: ['Only for the first business'] });
    expect(labelsOf((await getLostReasons(second)).json())).not.toContain('Only for the first business');
  });

  it('answers 401 when nobody is signed in', async () => {
    expect((await getLostReasons(null)).statusCode).toBe(401);
  });
});

describe('PUT /api/v1/lost-reasons', () => {
  it('replaces the whole list, trims the words, and keeps the order sent', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await putLostReasons(person, {
      reasons: ['  Price too high ', 'Chose a competitor', 'No answer'],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(labelsOf(response.json())).toEqual(['Price too high', 'Chose a competitor', 'No answer']);
    expect(response.json().items.map((item: { sort: number }) => item.sort)).toEqual([0, 1, 2]);
    expect(labelsOf((await getLostReasons(person)).json())).toEqual([
      'Price too high',
      'Chose a competitor',
      'No answer',
    ]);
  });

  it('accepts a list of one reason, and a reason used before (old leads keep their words)', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await putLostReasons(person, { reasons: ['Other'] })).statusCode).toBe(200);
    expect(labelsOf((await getLostReasons(person)).json())).toEqual(['Other']);
  });

  it('refuses the same reason twice, ignoring capitals, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await putLostReasons(person, { reasons: ['No reply', 'NO REPLY'] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('DUPLICATE_LOST_REASON');
    expect(labelsOf((await getLostReasons(person)).json())).toHaveLength(5);
  });

  it('allows the same reasons in two different businesses', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    expect((await putLostReasons(first, { reasons: ['Same words'] })).statusCode).toBe(200);
    expect((await putLostReasons(second, { reasons: ['Same words'] })).statusCode).toBe(200);
  });

  it('takes turns when two managers save at the same moment: the list is one of the two, never a mix', async () => {
    const person = await createSignedInPerson(app, database);
    const listOne = ['A1', 'A2', 'A3'];
    const listTwo = ['B1', 'B2'];
    const responses = await Promise.all([
      putLostReasons(person, { reasons: listOne }),
      putLostReasons(person, { reasons: listTwo }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    const finalLabels = labelsOf((await getLostReasons(person)).json());
    expect([listOne, listTwo]).toContainEqual(finalLabels);
  });

  it('records who did it, without the words', async () => {
    const person = await createSignedInPerson(app, database);
    await putLostReasons(person, { reasons: ['Secret-reason-words'] });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'lost_reasons.replaced')
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({ fields: ['reasons'], actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'lost_reasons.replaced')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ count: 1 });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-reason-words');
    const stored = await database.system
      .selectFrom('lost_reasons')
      .select('created_by')
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(stored.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 401 with nobody signed in, 403 without CSRF headers and to staff, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const body = { reasons: ['Changed'] };
    expect((await putLostReasons(null, body)).statusCode).toBe(401);
    expect((await putLostReasons(person, body, false)).statusCode).toBe(403);
    await makeStaff(person);
    expect((await putLostReasons(person, body)).statusCode).toBe(403);
    expect(labelsOf((await getLostReasons(person)).json())).toHaveLength(5);
  });

  it('answers 400 for an empty list, a blank or too long reason, too many reasons, or an unknown field', async () => {
    const person = await createSignedInPerson(app, database);
    const badBodies = [
      {},
      { reasons: [] },
      { reasons: [''] },
      { reasons: ['  '] },
      { reasons: ['x'.repeat(81)] },
      { reasons: Array.from({ length: 21 }, (_, position) => `Reason ${position}`) },
      { reasons: 'No reply' },
      { reasons: [5] },
      { reasons: ['Fine'], accountId: randomUUID() },
    ];
    for (const body of badBodies) {
      expect((await putLostReasons(person, body)).statusCode, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(labelsOf((await getLostReasons(person)).json())).toHaveLength(5);
  });
});
