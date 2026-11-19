import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { todayInTimeZone } from '../src/modules/core/offerings/helpers/offer-is-current';
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

/** Adds an offer as the person. */
const addOffer = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', '/offers', body, withCsrfHeaders);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** A date some days from today where the business is (Asia/Kolkata for a new business), written like 2026-12-31. */
function dateFromToday(days: number, timeZone = 'Asia/Kolkata'): string {
  const today = todayInTimeZone(new Date(), timeZone);
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('POST /api/v1/offers', () => {
  it('adds an offer that is on, with its words and last day', async () => {
    const person = await createSignedInPerson(app, database);
    const endsOn = dateFromToday(30);
    const response = await addOffer(person, { text: '  10 percent off for stays over three nights  ', endsOn });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      text: '10 percent off for stays over three nights',
      endsOn,
      current: true,
    });
    expect(Object.keys(response.json()).sort()).toEqual(['createdAt', 'current', 'endsOn', 'id', 'text', 'updatedAt']);
  });

  it('accepts an offer whose last day is today, and refuses one that ended yesterday', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await addOffer(person, { text: 'Ends today', endsOn: dateFromToday(0) })).statusCode).toBe(201);
    const yesterday = await addOffer(person, { text: 'Ended', endsOn: dateFromToday(-1) });
    expect(yesterday.statusCode, yesterday.body).toBe(400);
    expect(yesterday.json().error.code).toBe('OFFER_ALREADY_ENDED');
    expect((await addOffer(person, { text: 'Long ago', endsOn: '2020-01-01' })).json().error.code).toBe(
      'OFFER_ALREADY_ENDED',
    );
  });

  it('counts "today" where the business is: one time zone\'s today is another\'s tomorrow', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('accounts')
      .set({ time_zone: 'Pacific/Kiritimati' })
      .where('id', '=', person.profile.business.id)
      .execute();
    const todayThere = todayInTimeZone(new Date(), 'Pacific/Kiritimati');
    expect((await addOffer(person, { text: 'Ends today there', endsOn: todayThere })).statusCode).toBe(201);
    expect(
      (await addOffer(person, { text: 'Ended there', endsOn: dateFromToday(-1, 'Pacific/Kiritimati') })).statusCode,
    ).toBe(400);
    await database.system
      .updateTable('accounts')
      .set({ time_zone: 'Pacific/Pago_Pago' })
      .where('id', '=', person.profile.business.id)
      .execute();
    expect(
      (await addOffer(person, { text: 'Ends today there', endsOn: todayInTimeZone(new Date(), 'Pacific/Pago_Pago') }))
        .statusCode,
    ).toBe(201);
    expect(
      (await addOffer(person, { text: 'Ended there', endsOn: dateFromToday(-1, 'Pacific/Pago_Pago') })).statusCode,
    ).toBe(400);
  });

  it('writes a log line with field names only, an offer.created event with no words, and stamps who added it', async () => {
    const person = await createSignedInPerson(app, database);
    const endsOn = dateFromToday(10);
    const offer = (await addOffer(person, { text: 'Secret festival discount', endsOn })).json();
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offer.id)
      .executeTakeFirstOrThrow();
    expect(line).toMatchObject({
      kind: 'offers.created',
      record_type: 'offer',
      actor: { kind: 'user', id: person.profile.user.id },
    });
    expect([...line.fields].sort()).toEqual(['endsOn', 'text']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offer.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ offerId: offer.id, endsOn });
    expect(JSON.stringify([line, event])).not.toContain('Secret festival discount');
    const row = await database.system
      .selectFrom('offers')
      .selectAll()
      .where('id', '=', offer.id)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 409 OFFER_LIMIT when the business has 200 offers', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .insertInto('offers')
      .values(
        Array.from({ length: 200 }, (_, index) => ({
          id: randomUUID(),
          account_id: person.profile.business.id,
          text: `Offer ${index}`,
          ends_on: dateFromToday(5),
        })),
      )
      .execute();
    const response = await addOffer(person, { text: 'One too many', endsOn: dateFromToday(5) });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('OFFER_LIMIT');
  });

  it('answers 400 for no words, long words, a date that is missing, not a date or not real, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const endsOn = dateFromToday(5);
    const badBodies: unknown[] = [
      {},
      { endsOn },
      { text: 'No date' },
      { text: '   ', endsOn },
      { text: 'x'.repeat(301), endsOn },
      { text: 'Bad date', endsOn: 'next Friday' },
      { text: 'Bad date', endsOn: '2026-02-31' },
      { text: 'Bad date', endsOn: '2026-12-31T10:00:00Z' },
      { text: 'Bad date', endsOn: 20261231 },
      { text: 'Pushy', endsOn, current: false },
      { text: 'Pushy', endsOn, accountId: randomUUID() },
      { text: 'Pushy', endsOn, deletedAt: '2026-01-01T00:00:00Z' },
    ];
    for (const body of badBodies) {
      expect((await addOffer(person, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    const added = await database.system
      .selectFrom('offers')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(added).toHaveLength(0);
  });

  it('answers 403 to staff and to the "own leads only" role, 401 with nobody signed in, 403 without the web app headers, and adds nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const body = { text: 'Sneaky', endsOn: dateFromToday(5) };
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await addOffer(person, body)).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await addOffer(null, body)).statusCode).toBe(401);
    expect((await addOffer(person, body, false)).statusCode).toBe(403);
    const added = await database.system
      .selectFrom('offers')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(added).toHaveLength(0);
  });

  it('keeps businesses apart: an offer is added to the business of the person who adds it', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const offer = (await addOffer(first, { text: 'For the first only', endsOn: dateFromToday(5) })).json();
    const row = await database.system
      .selectFrom('offers')
      .select('account_id')
      .where('id', '=', offer.id)
      .executeTakeFirstOrThrow();
    expect(row.account_id).toBe(first.profile.business.id);
    const secondsOffers = await database.system
      .selectFrom('offers')
      .select('id')
      .where('account_id', '=', second.profile.business.id)
      .execute();
    expect(secondsOffers).toHaveLength(0);
  });
});

/** Lists offers as the person. `query` is the part after the `?`. */
const listOffers = (person: SignedInPerson | null, query = '') =>
  send(person, 'GET', `/offers${query ? `?${query}` : ''}`);

/** Changes an offer as the person. */
const patchOffer = (person: SignedInPerson | null, offerId: string, body: unknown, withCsrfHeaders = true) =>
  send(person, 'PATCH', `/offers/${offerId}`, body, withCsrfHeaders);

/** Puts an offer straight into the database, even one that has already ended (the API would refuse to add it). */
async function putOfferInDatabase(
  person: SignedInPerson,
  text: string,
  endsOn: string,
  options: { deleted?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await database.system
    .insertInto('offers')
    .values({
      id,
      account_id: person.profile.business.id,
      text,
      ends_on: endsOn,
      ...(options.deleted ? { deleted_at: new Date() } : {}),
    })
    .execute();
  return id;
}

/** The words of an offers answer, in order. */
const textsOf = (body: { items: Array<{ text: string }> }) => body.items.map((item) => item.text);

describe('GET /api/v1/offers', () => {
  it('is empty for a new business', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await listOffers(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('shows the offers that are still on, the ones ending soonest first, and hides ended and removed ones', async () => {
    const person = await createSignedInPerson(app, database);
    await putOfferInDatabase(person, 'Christmas', dateFromToday(45));
    await putOfferInDatabase(person, 'This weekend', dateFromToday(2));
    await putOfferInDatabase(person, 'Ends today', dateFromToday(0));
    await putOfferInDatabase(person, 'Ended yesterday', dateFromToday(-1));
    await putOfferInDatabase(person, 'Removed', dateFromToday(10), { deleted: true });
    const response = await listOffers(person);
    expect(textsOf(response.json())).toEqual(['Ends today', 'This weekend', 'Christmas']);
    expect(response.json().items.every((item: { current: boolean }) => item.current)).toBe(true);
  });

  it('adds the ended ones, marked as not current, with include=expired, but never a removed one', async () => {
    const person = await createSignedInPerson(app, database);
    await putOfferInDatabase(person, 'Still on', dateFromToday(3));
    await putOfferInDatabase(person, 'Long ago', dateFromToday(-100));
    await putOfferInDatabase(person, 'Yesterday', dateFromToday(-1));
    await putOfferInDatabase(person, 'Removed', dateFromToday(3), { deleted: true });
    const response = await listOffers(person, 'include=expired');
    expect(textsOf(response.json())).toEqual(['Long ago', 'Yesterday', 'Still on']);
    expect(response.json().items.map((item: { current: boolean }) => item.current)).toEqual([false, false, true]);
  });

  it("uses the business's time zone for what is still on", async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('accounts')
      .set({ time_zone: 'Pacific/Kiritimati' })
      .where('id', '=', person.profile.business.id)
      .execute();
    const todayThere = todayInTimeZone(new Date(), 'Pacific/Kiritimati');
    await putOfferInDatabase(person, 'Ends today there', todayThere);
    await putOfferInDatabase(person, 'Ended there', dateFromToday(-1, 'Pacific/Kiritimati'));
    expect(textsOf((await listOffers(person)).json())).toEqual(['Ends today there']);
  });

  it("lets every role read it, and never shows another business's offers", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await putOfferInDatabase(stranger, 'Their secret offer', dateFromToday(5));
    await putOfferInDatabase(person, 'Mine', dateFromToday(5));
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      const response = await listOffers(person);
      expect(response.statusCode, role).toBe(200);
      expect(textsOf(response.json())).toEqual(['Mine']);
    }
  });

  it('answers 401 with nobody signed in, and 400 for a bad filter', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listOffers(null)).statusCode).toBe(401);
    expect((await listOffers(person, 'include=everything')).statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/offers/{id}', () => {
  it('changes the words and the last day, and leaves the rest as it was', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Old words', dateFromToday(5));
    const endsOn = dateFromToday(60);
    const response = await patchOffer(person, offerId, { text: '  New words  ', endsOn });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ id: offerId, text: 'New words', endsOn, current: true });
    const onlyWords = await patchOffer(person, offerId, { text: 'Newer words' });
    expect(onlyWords.json()).toMatchObject({ text: 'Newer words', endsOn });
  });

  it('brings an ended offer back with a new last day, and lets its words be edited without one', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Ended', dateFromToday(-10));
    expect((await patchOffer(person, offerId, { text: 'Ended, tidied' })).json()).toMatchObject({
      text: 'Ended, tidied',
      current: false,
    });
    const back = await patchOffer(person, offerId, { endsOn: dateFromToday(7) });
    expect(back.json()).toMatchObject({ current: true });
    expect(textsOf((await listOffers(person)).json())).toEqual(['Ended, tidied']);
  });

  it('answers 400 OFFER_ALREADY_ENDED for a new last day before today, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Keep me', dateFromToday(5));
    const response = await patchOffer(person, offerId, { text: 'Changed too', endsOn: dateFromToday(-1) });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('OFFER_ALREADY_ENDED');
    expect(textsOf((await listOffers(person)).json())).toEqual(['Keep me']);
  });

  it('writes a log line with the changed field names only, and an offer.updated event with no words', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Old words', dateFromToday(5));
    await patchOffer(person, offerId, { text: 'Secret festival words', endsOn: dateFromToday(9) });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offerId)
      .where('kind', '=', 'offers.updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect([...lines[0]!.fields].sort()).toEqual(['endsOn', 'text']);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offer.updated')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([
      { offerId, fields: expect.arrayContaining(['text', 'endsOn']) },
    ]);
    expect(JSON.stringify([lines, events])).not.toContain('Secret festival words');
    const row = await database.system
      .selectFrom('offers')
      .selectAll()
      .where('id', '=', offerId)
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('writes nothing when the values sent are the ones it already has', async () => {
    const person = await createSignedInPerson(app, database);
    const endsOn = dateFromToday(5);
    const offerId = await putOfferInDatabase(person, 'Same', endsOn);
    const response = await patchOffer(person, offerId, { text: 'Same', endsOn });
    expect(response.statusCode, response.body).toBe(200);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', offerId)
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('answers 400 for nothing to change, bad values and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Words', dateFromToday(5));
    const empty = await patchOffer(person, offerId, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('NOTHING_TO_CHANGE');
    const badBodies: unknown[] = [
      { text: '   ' },
      { text: 'x'.repeat(301) },
      { endsOn: 'next Friday' },
      { endsOn: '2026-02-31' },
      { endsOn: null },
      { current: false },
      { deletedAt: '2026-01-01T00:00:00Z' },
      { accountId: randomUUID() },
    ];
    for (const body of badBodies)
      expect((await patchOffer(person, offerId, body)).statusCode, JSON.stringify(body)).toBe(400);
    expect((await patchOffer(person, 'abc', { text: 'x' })).statusCode).toBe(400);
  });

  it("answers 404 for an unknown id, a removed offer and another business's offer", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangers = await putOfferInDatabase(stranger, 'Theirs', dateFromToday(5));
    const removed = await putOfferInDatabase(person, 'Removed', dateFromToday(5), { deleted: true });
    expect((await patchOffer(person, randomUUID(), { text: 'x' })).statusCode).toBe(404);
    expect((await patchOffer(person, removed, { text: 'x' })).statusCode).toBe(404);
    expect((await patchOffer(person, strangers, { text: 'Mine now' })).statusCode).toBe(404);
    expect(textsOf((await listOffers(stranger)).json())).toEqual(['Theirs']);
  });

  it('answers 403 to staff and to the "own leads only" role, 401 with nobody signed in, 403 without the web app headers, and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Untouched', dateFromToday(5));
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await patchOffer(person, offerId, { text: 'Sneaky' })).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await patchOffer(null, offerId, { text: 'x' })).statusCode).toBe(401);
    expect((await patchOffer(person, offerId, { text: 'x' }, false)).statusCode).toBe(403);
    expect(textsOf((await listOffers(person)).json())).toEqual(['Untouched']);
  });

  it('keeps both changes when two managers change different fields of one offer at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Words', dateFromToday(5));
    const endsOn = dateFromToday(40);
    const responses = await Promise.all([
      patchOffer(person, offerId, { text: 'Changed words' }),
      patchOffer(person, offerId, { endsOn }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect((await listOffers(person)).json().items[0]).toMatchObject({ text: 'Changed words', endsOn });
  });
});

/** Removes an offer as the person. */
const deleteOffer = (person: SignedInPerson | null, offerId: string, withCsrfHeaders = true) =>
  send(person, 'DELETE', `/offers/${offerId}`, undefined, withCsrfHeaders);

describe('DELETE /api/v1/offers/{id}', () => {
  it('removes an offer from every list but keeps its row, even an ended one', async () => {
    const person = await createSignedInPerson(app, database);
    const stays = await putOfferInDatabase(person, 'Stays', dateFromToday(5));
    const ended = await putOfferInDatabase(person, 'Ended', dateFromToday(-5));
    const removedNow = await putOfferInDatabase(person, 'Removed now', dateFromToday(8));
    expect((await deleteOffer(person, removedNow)).statusCode).toBe(204);
    expect((await deleteOffer(person, ended)).statusCode).toBe(204);
    expect(textsOf((await listOffers(person, 'include=expired')).json())).toEqual(['Stays']);
    const row = await database.system
      .selectFrom('offers')
      .selectAll()
      .where('id', '=', removedNow)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(stays).toBeTruthy();
  });

  it('writes a log line and an offer.deleted event with no words in them', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Secret festival words', dateFromToday(5));
    await deleteOffer(person, offerId);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', offerId)
      .where('kind', '=', 'offers.deleted')
      .executeTakeFirstOrThrow();
    expect(line).toMatchObject({ record_type: 'offer', actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'offer.deleted')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ offerId });
    expect(JSON.stringify([line, event])).not.toContain('Secret festival words');
  });

  it("answers 404 for a second delete, an unknown id and another business's offer, and 400 for a bad id", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangers = await putOfferInDatabase(stranger, 'Theirs', dateFromToday(5));
    const offerId = await putOfferInDatabase(person, 'Mine', dateFromToday(5));
    expect((await deleteOffer(person, offerId)).statusCode).toBe(204);
    expect((await deleteOffer(person, offerId)).statusCode).toBe(404);
    expect((await deleteOffer(person, randomUUID())).statusCode).toBe(404);
    expect((await deleteOffer(person, strangers)).statusCode).toBe(404);
    expect((await deleteOffer(person, 'abc')).statusCode).toBe(400);
    expect(textsOf((await listOffers(stranger)).json())).toEqual(['Theirs']);
  });

  it('answers 403 to staff and to the "own leads only" role, 401 with nobody signed in, 403 without the web app headers, and removes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Stays', dateFromToday(5));
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await deleteOffer(person, offerId)).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await deleteOffer(null, offerId)).statusCode).toBe(401);
    expect((await deleteOffer(person, offerId, false)).statusCode).toBe(403);
    expect(textsOf((await listOffers(person)).json())).toEqual(['Stays']);
  });

  it('never lets the app really delete a row', async () => {
    const person = await createSignedInPerson(app, database);
    const offerId = await putOfferInDatabase(person, 'Stays', dateFromToday(5));
    await expect(
      database.runInAccountTransaction(person.profile.business.id, (transaction) =>
        transaction.deleteFrom('offers').where('id', '=', offerId).execute(),
      ),
    ).rejects.toThrow();
  });
});
