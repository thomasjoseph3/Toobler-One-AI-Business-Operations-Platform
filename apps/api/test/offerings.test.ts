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

/** Changes an offering as the person. */
const patchOffering = (person: SignedInPerson | null, offeringId: string, body: unknown, withCsrfHeaders = true) =>
  send(person, 'PATCH', `/offerings/${offeringId}`, body, withCsrfHeaders);

/** Removes an offering as the person. */
const deleteOffering = (person: SignedInPerson | null, offeringId: string, withCsrfHeaders = true) =>
  send(person, 'DELETE', `/offerings/${offeringId}`, undefined, withCsrfHeaders);

/** Adds an offering through the real route and returns its id. */
async function addOfferingAndGetId(person: SignedInPerson, fields: object): Promise<string> {
  const response = await addOffering(person, fields);
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** An offering with a price, for the tests that change it. */
const FAMILY_ROOM = { name: 'Family room', fromPricePaise: 450_000, priceUnit: 'per night', gstMode: 'plus' } as const;

describe('PATCH /api/v1/offerings/{id}', () => {
  it('changes the words and leaves the rest as it was', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, { ...FAMILY_ROOM, description: 'Old words' });
    const response = await patchOffering(person, offeringId, {
      name: '  Deluxe family room  ',
      description: 'New words',
      seasonNote: 'Higher in December',
      includes: 'Breakfast',
      details: [{ label: 'Check-in', value: '2 PM' }],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: offeringId,
      name: 'Deluxe family room',
      description: 'New words',
      seasonNote: 'Higher in December',
      includes: 'Breakfast',
      details: [{ label: 'Check-in', value: '2 PM' }],
      fromPricePaise: 450_000,
      priceUnit: 'per night',
      gstMode: 'plus',
      active: true,
      sort: 0,
    });
  });

  it('changes just the price and keeps its unit and GST note, and says the new price in words', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    const response = await patchOffering(person, offeringId, { fromPricePaise: 520_000 });
    expect(response.json()).toMatchObject({
      fromPricePaise: 520_000,
      priceUnit: 'per night',
      gstMode: 'plus',
      priceInWords: 'from ₹5,200 a night plus GST',
    });
    const other = await patchOffering(person, offeringId, { priceUnit: 'per person', gstMode: 'included' });
    expect(other.json().priceInWords).toBe('from ₹5,200 a person including GST');
  });

  it('takes the whole price away with fromPricePaise null, and puts one back with all three', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    const cleared = await patchOffering(person, offeringId, { fromPricePaise: null });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json()).toMatchObject({ fromPricePaise: null, priceUnit: null, gstMode: null, priceInWords: null });
    const back = await patchOffering(person, offeringId, {
      fromPricePaise: 300_000,
      priceUnit: 'per visit',
      gstMode: 'none',
    });
    expect(back.json().priceInWords).toBe('from ₹3,000 a visit with no GST');
  });

  it('answers 400 INCOMPLETE_PRICE when a change would leave a price half described', async () => {
    const person = await createSignedInPerson(app, database);
    const priced = await addOfferingAndGetId(person, FAMILY_ROOM);
    const unpriced = await addOfferingAndGetId(person, { name: 'Day tour' });
    const bad: Array<[string, object]> = [
      [unpriced, { fromPricePaise: 100_000 }],
      [unpriced, { priceUnit: 'per night' }],
      [unpriced, { gstMode: 'plus' }],
      [unpriced, { fromPricePaise: 100_000, priceUnit: 'per night' }],
      [priced, { priceUnit: null }],
      [priced, { gstMode: null }],
      [priced, { fromPricePaise: null, priceUnit: 'per night' }],
    ];
    for (const [offeringId, body] of bad) {
      const response = await patchOffering(person, offeringId, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json().error.code).toBe('INCOMPLETE_PRICE');
    }
    expect((await listOfferings(person)).json().items[0]).toMatchObject({ fromPricePaise: 450_000 });
  });

  it('clears the description, the season note and what is included with null or blank text', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, {
      name: 'Spa',
      description: 'A',
      seasonNote: 'B',
      includes: 'C',
    });
    const response = await patchOffering(person, offeringId, { description: null, seasonNote: '   ', includes: '' });
    expect(response.json()).toMatchObject({ description: null, seasonNote: null, includes: null });
  });

  it('switches an offering off and on, and an off offering can still be edited', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    expect((await patchOffering(person, offeringId, { active: false })).json().active).toBe(false);
    expect((await listOfferings(person, 'active=true')).json().items).toHaveLength(0);
    expect((await patchOffering(person, offeringId, { name: 'Renamed while off' })).json()).toMatchObject({
      name: 'Renamed while off',
      active: false,
    });
    expect((await patchOffering(person, offeringId, { active: true })).json().active).toBe(true);
    expect((await listOfferings(person, 'active=true')).json().items).toHaveLength(1);
  });

  it('names the person who looks after it, and takes them away again with null', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    expect((await patchOffering(person, offeringId, { ownerUserId: person.profile.user.id })).json().ownerUserId).toBe(
      person.profile.user.id,
    );
    expect((await patchOffering(person, offeringId, { ownerUserId: null })).json().ownerUserId).toBeNull();
  });

  it('replaces the whole list of details', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, {
      ...FAMILY_ROOM,
      details: [
        { label: 'A', value: '1' },
        { label: 'B', value: '2' },
      ],
    });
    expect((await patchOffering(person, offeringId, { details: [{ label: 'C', value: '3' }] })).json().details).toEqual(
      [{ label: 'C', value: '3' }],
    );
    expect((await patchOffering(person, offeringId, { details: [] })).json().details).toEqual([]);
  });

  it('writes one log line with the changed field names only, and an offering.updated event with no words or prices', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    await patchOffering(person, offeringId, { name: 'Secret Suite', fromPricePaise: 999_900, active: false });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offeringId)
      .where('kind', '=', 'offerings.updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect([...lines[0]!.fields].sort()).toEqual(['active', 'fromPricePaise', 'name']);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offering.updated')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([
      { offeringId, fields: expect.arrayContaining(['name', 'fromPricePaise', 'active']) },
    ]);
    expect(JSON.stringify([lines, events])).not.toContain('Secret Suite');
    expect(JSON.stringify([lines, events])).not.toContain('9999');
    const row = await database.system
      .selectFrom('offerings')
      .selectAll()
      .where('id', '=', offeringId)
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('writes nothing when the values sent are the ones it already has', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, { ...FAMILY_ROOM, details: [{ label: 'A', value: '1' }] });
    const before = (await listOfferings(person)).json().items[0];
    const response = await patchOffering(person, offeringId, {
      ...FAMILY_ROOM,
      name: 'Family room',
      active: true,
      details: [{ label: 'A', value: '1' }],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().updatedAt).toBe(before.updatedAt);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', offeringId)
      .where('kind', '=', 'offerings.updated')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it("answers 409 OFFERING_EXISTS when the new name is another live offering's, but lets an offering change the capitals of its own name", async () => {
    const person = await createSignedInPerson(app, database);
    const first = await addOfferingAndGetId(person, { name: 'Family room' });
    const second = await addOfferingAndGetId(person, { name: 'Day tour' });
    const clash = await patchOffering(person, second, { name: 'FAMILY ROOM' });
    expect(clash.statusCode, clash.body).toBe(409);
    expect(clash.json().error.code).toBe('OFFERING_EXISTS');
    expect(clash.json().error.details).toEqual({ offeringId: first });
    expect((await patchOffering(person, first, { name: 'FAMILY ROOM' })).json().name).toBe('FAMILY ROOM');
  });

  it('answers 400 NOTHING_TO_CHANGE for an empty body, and 400 for bad values and for fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    const empty = await patchOffering(person, offeringId, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('NOTHING_TO_CHANGE');
    const badBodies: unknown[] = [
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { description: 'y'.repeat(1001) },
      { fromPricePaise: -1 },
      { fromPricePaise: 10.5 },
      { fromPricePaise: 100_000_000_001 },
      { gstMode: 'maybe' },
      { details: Array.from({ length: 11 }, (_, index) => ({ label: `L${index}`, value: 'v' })) },
      { details: [{ label: 'No value' }] },
      { active: 'yes' },
      { ownerUserId: 'abc' },
      { sort: 3 },
      { deletedAt: '2026-01-01T00:00:00Z' },
      { accountId: randomUUID() },
      { createdBy: { kind: 'user', id: 'x' } },
    ];
    for (const body of badBodies) {
      expect((await patchOffering(person, offeringId, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await patchOffering(person, 'abc', { name: 'x' })).statusCode).toBe(400);
  });

  it('answers 403 to staff and to the "own leads only" role, 401 with nobody signed in, 403 without the web app headers, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await patchOffering(person, offeringId, { name: 'Sneaky' })).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await patchOffering(null, offeringId, { name: 'x' })).statusCode).toBe(401);
    expect((await patchOffering(person, offeringId, { name: 'x' }, false)).statusCode).toBe(403);
    expect((await listOfferings(person)).json().items[0].name).toBe('Family room');
  });

  it("answers 404 for an unknown id, a removed offering, another business's offering, and an owner from another business", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersOffering = await addOfferingAndGetId(stranger, { name: 'Theirs' });
    const removed = await addOfferingAndGetId(person, { name: 'Removed' });
    await deleteOffering(person, removed);
    const own = await addOfferingAndGetId(person, { name: 'Own' });
    expect((await patchOffering(person, randomUUID(), { name: 'x' })).statusCode).toBe(404);
    expect((await patchOffering(person, removed, { name: 'x' })).statusCode).toBe(404);
    expect((await patchOffering(person, strangersOffering, { name: 'Mine now' })).statusCode).toBe(404);
    expect((await listOfferings(stranger)).json().items[0].name).toBe('Theirs');
    expect((await patchOffering(person, own, { ownerUserId: stranger.profile.user.id })).statusCode).toBe(404);
    expect((await patchOffering(person, own, { ownerUserId: randomUUID() })).statusCode).toBe(404);
  });

  it('keeps both changes when two managers change different fields of one offering at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    const responses = await Promise.all([
      patchOffering(person, offeringId, { description: 'Written by one' }),
      patchOffering(person, offeringId, { includes: 'Written by two' }),
      patchOffering(person, offeringId, { seasonNote: 'Written by three' }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect((await listOfferings(person)).json().items[0]).toMatchObject({
      description: 'Written by one',
      includes: 'Written by two',
      seasonNote: 'Written by three',
    });
  });
});

describe('DELETE /api/v1/offerings/{id}', () => {
  it('removes an offering from every list but keeps its row, and frees the name', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    await addOfferingAndGetId(person, { name: 'Stays' });
    const response = await deleteOffering(person, offeringId);
    expect(response.statusCode, response.body).toBe(204);
    expect(namesOf((await listOfferings(person)).json())).toEqual(['Stays']);
    const row = await database.system
      .selectFrom('offerings')
      .selectAll()
      .where('id', '=', offeringId)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
    // The name can be used again, and the new offering goes to the end
    const again = await addOffering(person, { name: 'Family room' });
    expect(again.statusCode, again.body).toBe(201);
    expect(namesOf((await listOfferings(person)).json())).toEqual(['Stays', 'Family room']);
  });

  it('writes a log line and an offering.deleted event with no words in them', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, { name: 'Secret Suite' });
    await deleteOffering(person, offeringId);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offeringId)
      .where('kind', '=', 'offerings.deleted')
      .executeTakeFirstOrThrow();
    expect(line).toMatchObject({ record_type: 'offering', actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offering.deleted')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ offeringId });
    expect(JSON.stringify([line, event])).not.toContain('Secret Suite');
  });

  it("answers 404 for a second delete, an unknown id and another business's offering, and 400 for a bad id", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangersOffering = await addOfferingAndGetId(stranger, { name: 'Theirs' });
    const offeringId = await addOfferingAndGetId(person, { name: 'Mine' });
    expect((await deleteOffering(person, offeringId)).statusCode).toBe(204);
    expect((await deleteOffering(person, offeringId)).statusCode).toBe(404);
    expect((await deleteOffering(person, randomUUID())).statusCode).toBe(404);
    expect((await deleteOffering(person, strangersOffering)).statusCode).toBe(404);
    expect((await deleteOffering(person, 'abc')).statusCode).toBe(400);
    expect(namesOf((await listOfferings(stranger)).json())).toEqual(['Theirs']);
  });

  it('answers 403 to staff and to the "own leads only" role, 401 with nobody signed in, 403 without the web app headers, and removes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await deleteOffering(person, offeringId)).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await deleteOffering(null, offeringId)).statusCode).toBe(401);
    expect((await deleteOffering(person, offeringId, false)).statusCode).toBe(403);
    expect((await listOfferings(person)).json().items).toHaveLength(1);
  });

  it('never lets the app really delete a row', async () => {
    const person = await createSignedInPerson(app, database);
    const offeringId = await addOfferingAndGetId(person, FAMILY_ROOM);
    await expect(
      database.runInAccountTransaction(person.profile.business.id, (transaction) =>
        transaction.deleteFrom('offerings').where('id', '=', offeringId).execute(),
      ),
    ).rejects.toThrow();
  });
});
