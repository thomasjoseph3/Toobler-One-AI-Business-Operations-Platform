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
