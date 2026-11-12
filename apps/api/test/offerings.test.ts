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

/** Adds an offering as the person. */
const addOffering = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', '/offerings', body, withCsrfHeaders);

/** Lists offerings as the person. `query` is the part after the `?`. */
const listOfferings = (person: SignedInPerson | null, query = '') =>
  send(person, 'GET', `/offerings${query ? `?${query}` : ''}`);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** The names of an offerings answer, in order. */
const namesOf = (body: { items: Array<{ name: string }> }) => body.items.map((item) => item.name);

describe('POST /api/v1/offerings', () => {
  it('adds an offering from just a name: switched on, at the top of the list, no price, nothing else', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addOffering(person, { name: 'Family room' });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Family room',
      description: null,
      fromPricePaise: null,
      priceUnit: null,
      gstMode: null,
      priceInWords: null,
      seasonNote: null,
      includes: null,
      details: [],
      active: true,
      sort: 0,
      ownerUserId: null,
    });
    expect(Object.keys(response.json()).sort()).toEqual([
      'active',
      'createdAt',
      'description',
      'details',
      'fromPricePaise',
      'gstMode',
      'id',
      'includes',
      'name',
      'ownerUserId',
      'priceInWords',
      'priceUnit',
      'seasonNote',
      'sort',
      'updatedAt',
    ]);
  });

  it('adds a fully described offering and says its price in words', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addOffering(person, {
      name: 'Deluxe room',
      description: '  Sea view, two beds  ',
      fromPricePaise: 450_000,
      priceUnit: 'per night',
      gstMode: 'plus',
      seasonNote: 'Higher in December and January',
      includes: 'Breakfast for two',
      details: [
        { label: 'Check-in', value: '2 PM' },
        { label: 'Max guests', value: '4' },
      ],
      active: false,
      ownerUserId: person.profile.user.id,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      description: 'Sea view, two beds',
      fromPricePaise: 450_000,
      priceUnit: 'per night',
      gstMode: 'plus',
      priceInWords: 'from ₹4,500 a night plus GST',
      seasonNote: 'Higher in December and January',
      includes: 'Breakfast for two',
      details: [
        { label: 'Check-in', value: '2 PM' },
        { label: 'Max guests', value: '4' },
      ],
      active: false,
      ownerUserId: person.profile.user.id,
    });
  });

  it('puts each new offering at the end of the list', async () => {
    const person = await createSignedInPerson(app, database);
    for (const name of ['First', 'Second', 'Third']) await addOffering(person, { name });
    const list = (await listOfferings(person)).json();
    expect(namesOf(list)).toEqual(['First', 'Second', 'Third']);
    expect(list.items.map((item: { sort: number }) => item.sort)).toEqual([0, 1, 2]);
  });

  it('treats blank optional words as nothing, and trims the name', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addOffering(person, {
      name: '  Spa day  ',
      description: '   ',
      seasonNote: '',
      includes: ' ',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Spa day', description: null, seasonNote: null, includes: null });
  });

  it('keeps a price in whole paise, accepting zero and the highest allowed', async () => {
    const person = await createSignedInPerson(app, database);
    const free = await addOffering(person, {
      name: 'Free tour',
      fromPricePaise: 0,
      priceUnit: 'per person',
      gstMode: 'none',
    });
    expect(free.statusCode, free.body).toBe(201);
    expect(free.json().priceInWords).toBe('from ₹0 a person with no GST');
    const highest = await addOffering(person, {
      name: 'Island',
      fromPricePaise: 100_000_000_000,
      priceUnit: 'per package',
      gstMode: 'included',
    });
    expect(highest.statusCode, highest.body).toBe(201);
  });

  it('writes an activity-log line with field names only, and an offering.created event, and stamps who added it', async () => {
    const person = await createSignedInPerson(app, database);
    const offering = (
      await addOffering(person, {
        name: 'Secret Suite',
        description: 'Private words',
        fromPricePaise: 999_900,
        priceUnit: 'per night',
        gstMode: 'plus',
      })
    ).json();
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offering.id)
      .executeTakeFirstOrThrow();
    expect(line).toMatchObject({
      kind: 'offerings.created',
      record_type: 'offering',
      actor: { kind: 'user', id: person.profile.user.id },
    });
    expect([...line.fields].sort()).toEqual(['description', 'fromPricePaise', 'gstMode', 'name', 'priceUnit']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offering.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ offeringId: offering.id, active: true });
    expect(JSON.stringify([line, event])).not.toContain('Secret Suite');
    expect(JSON.stringify([line, event])).not.toContain('Private words');
    expect(JSON.stringify([line, event])).not.toContain('9999');
    const row = await database.system
      .selectFrom('offerings')
      .selectAll()
      .where('id', '=', offering.id)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 409 OFFERING_EXISTS, naming the existing one, for a name that is taken (ignoring capitals)', async () => {
    const person = await createSignedInPerson(app, database);
    const first = (await addOffering(person, { name: 'Family room' })).json();
    for (const name of ['Family room', 'FAMILY ROOM', '  family room ']) {
      const response = await addOffering(person, { name });
      expect(response.statusCode, name).toBe(409);
      expect(response.json().error.code).toBe('OFFERING_EXISTS');
      expect(response.json().error.details).toEqual({ offeringId: first.id });
    }
    expect((await listOfferings(person)).json().items).toHaveLength(1);
  });

  it('lets two businesses have an offering with the same name', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    expect((await addOffering(first, { name: 'Family room' })).statusCode).toBe(201);
    expect((await addOffering(second, { name: 'Family room' })).statusCode).toBe(201);
  });

  it('answers 409 OFFERING_LIMIT when the business has 200 offerings', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .insertInto('offerings')
      .values(
        Array.from({ length: 200 }, (_, index) => ({
          id: randomUUID(),
          account_id: person.profile.business.id,
          name: `Offering ${index}`,
          sort: index,
        })),
      )
      .execute();
    const response = await addOffering(person, { name: 'One too many' });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('OFFERING_LIMIT');
  });

  it('answers 403 to staff and to the "own leads only" role, and adds nothing', async () => {
    const person = await createSignedInPerson(app, database);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await addOffering(person, { name: 'Sneaky' })).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await listOfferings(person)).json().items).toHaveLength(0);
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await addOffering(null, { name: 'x' })).statusCode).toBe(401);
    expect((await addOffering(person, { name: 'x' }, false)).statusCode).toBe(403);
    expect((await listOfferings(person)).json().items).toHaveLength(0);
  });

  it('answers 404 for an owner who works for another business, or does not exist', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const response = await addOffering(person, { name: 'x', ownerUserId: stranger.profile.user.id });
    expect(response.statusCode, response.body).toBe(404);
    expect((await addOffering(person, { name: 'x', ownerUserId: randomUUID() })).statusCode).toBe(404);
    expect((await listOfferings(person)).json().items).toHaveLength(0);
  });

  it('answers 400 for a missing or long name, a half-described price, bad numbers and words, too many details, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const badBodies: unknown[] = [
      {},
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { name: 'x', description: 'y'.repeat(1001) },
      { name: 'x', seasonNote: 'y'.repeat(301) },
      { name: 'x', includes: 'y'.repeat(501) },
      { name: 'x', fromPricePaise: 1000 },
      { name: 'x', priceUnit: 'per night' },
      { name: 'x', gstMode: 'plus' },
      { name: 'x', fromPricePaise: 1000, priceUnit: 'per night' },
      { name: 'x', fromPricePaise: -1, priceUnit: 'per night', gstMode: 'plus' },
      { name: 'x', fromPricePaise: 10.5, priceUnit: 'per night', gstMode: 'plus' },
      { name: 'x', fromPricePaise: 100_000_000_001, priceUnit: 'per night', gstMode: 'plus' },
      { name: 'x', fromPricePaise: '1000', priceUnit: 'per night', gstMode: 'plus' },
      { name: 'x', fromPricePaise: 1000, priceUnit: 'y'.repeat(41), gstMode: 'plus' },
      { name: 'x', fromPricePaise: 1000, priceUnit: 'per night', gstMode: 'maybe' },
      { name: 'x', details: Array.from({ length: 11 }, (_, index) => ({ label: `L${index}`, value: 'v' })) },
      { name: 'x', details: [{ label: 'No value' }] },
      { name: 'x', details: [{ label: 'x'.repeat(41), value: 'v' }] },
      { name: 'x', details: [{ label: 'a', value: 'v', extra: 1 }] },
      { name: 'x', active: 'yes' },
      { name: 'x', ownerUserId: 'abc' },
      { name: 'x', sort: 5 },
      { name: 'x', deletedAt: '2026-01-01T00:00:00Z' },
      { name: 'x', accountId: randomUUID() },
      { name: 'x', createdBy: { kind: 'user', id: 'someone' } },
    ];
    for (const body of badBodies) {
      const response = await addOffering(person, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await listOfferings(person)).json().items).toHaveLength(0);
  });

  it('eight people adding the same name at once make one offering', async () => {
    const person = await createSignedInPerson(app, database);
    const responses = await Promise.all(Array.from({ length: 8 }, () => addOffering(person, { name: 'Family room' })));
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(7);
    expect((await listOfferings(person)).json().items).toHaveLength(1);
  });

  it('eight offerings added at once get eight different positions', async () => {
    const person = await createSignedInPerson(app, database);
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) => addOffering(person, { name: `Offering ${index}` })),
    );
    expect(responses.map((response) => response.statusCode)).toEqual(Array(8).fill(201));
    const positions = (await listOfferings(person)).json().items.map((item: { sort: number }) => item.sort);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('GET /api/v1/offerings', () => {
  it('is empty for a new business', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await listOfferings(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('lists the ones that are on, the ones that are off, or both', async () => {
    const person = await createSignedInPerson(app, database);
    await addOffering(person, { name: 'On one' });
    await addOffering(person, { name: 'Off one', active: false });
    await addOffering(person, { name: 'On two' });
    expect(namesOf((await listOfferings(person)).json())).toEqual(['On one', 'Off one', 'On two']);
    expect(namesOf((await listOfferings(person, 'active=true')).json())).toEqual(['On one', 'On two']);
    expect(namesOf((await listOfferings(person, 'active=false')).json())).toEqual(['Off one']);
  });

  it('never shows a removed offering', async () => {
    const person = await createSignedInPerson(app, database);
    const gone = (await addOffering(person, { name: 'Gone' })).json();
    await addOffering(person, { name: 'Stays' });
    await database.system.updateTable('offerings').set({ deleted_at: new Date() }).where('id', '=', gone.id).execute();
    expect(namesOf((await listOfferings(person)).json())).toEqual(['Stays']);
  });

  it('lets every role read it', async () => {
    const person = await createSignedInPerson(app, database);
    await addOffering(person, { name: 'Family room' });
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      const response = await listOfferings(person);
      expect(response.statusCode, role).toBe(200);
      expect(response.json().items).toHaveLength(1);
    }
  });

  it("never shows another business's offerings", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await addOffering(stranger, { name: 'Their secret room' });
    await addOffering(person, { name: 'Mine' });
    expect(namesOf((await listOfferings(person)).json())).toEqual(['Mine']);
  });

  it('answers 401 with nobody signed in, and 400 for a bad filter', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listOfferings(null)).statusCode).toBe(401);
    expect((await listOfferings(person, 'active=maybe')).statusCode).toBe(400);
  });
});
