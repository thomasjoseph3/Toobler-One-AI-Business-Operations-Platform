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
  method: 'GET' | 'PUT',
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

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** Makes the person's business use the given default country (a number typed without a country code is read as that country). */
async function setDefaultCountry(person: SignedInPerson, country: string) {
  await database.system
    .updateTable('accounts')
    .set({ default_country: country })
    .where('id', '=', person.profile.business.id)
    .execute();
}

/** A new business whose people type local numbers as Indian numbers. */
async function newBusiness(): Promise<SignedInPerson> {
  const person = await createSignedInPerson(app, database);
  await setDefaultCountry(person, 'IN');
  return person;
}

/** A phone number nobody else in this run uses, in international form. */
const uniqueIndianNumber = () => `+9198${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

type Entry = { id: string; phone: string | null; email: string | null; reason: string | null; createdAt: string };

describe('GET /api/v1/block-list', () => {
  it('is empty for a new business', async () => {
    const person = await newBusiness();
    const response = await send(person, 'GET', '/block-list');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('answers 403 to staff who are not managers, and 401 to nobody', async () => {
    const person = await newBusiness();
    expect((await send(null, 'GET', '/block-list')).statusCode).toBe(401);
    await setRole(person, 'staff');
    expect((await send(person, 'GET', '/block-list')).statusCode).toBe(403);
    await setRole(person, 'staff_own');
    expect((await send(person, 'GET', '/block-list')).statusCode).toBe(403);
  });
});

describe('PUT /api/v1/block-list', () => {
  it('saves numbers and emails: a number is kept in international form, an email in lower case', async () => {
    const person = await newBusiness();
    const response = await send(person, 'PUT', '/block-list', {
      items: [
        { phone: '098470 12345', reason: 'Calls every day to sell insurance' },
        { email: 'Sales@Spammy.EXAMPLE' },
        { phone: '+971 50 123 4567' },
      ],
    });
    expect(response.statusCode, response.body).toBe(200);
    const items = response.json().items as Entry[];
    expect(items).toHaveLength(3);
    // Entries saved together come back in a fixed order: numbers by their digits, then emails
    expect(items.map((entry) => entry.phone)).toEqual(['+919847012345', '+971501234567', null]);
    expect(items.map((entry) => entry.email)).toEqual([null, null, 'sales@spammy.example']);
    expect(items.find((entry) => entry.phone === '+919847012345')!.reason).toBe('Calls every day to sell insurance');
    expect(items.find((entry) => entry.email !== null)!.reason).toBeNull();
    // A read gives the same list
    expect((await send(person, 'GET', '/block-list')).json().items).toEqual(items);
  });

  it('saves the whole list: entries not sent are removed, new ones added, and a kept entry keeps its id and date', async () => {
    const person = await newBusiness();
    const first = (
      await send(person, 'PUT', '/block-list', {
        items: [
          { phone: '+919847000001', reason: 'old reason' },
          { email: 'a@spam.example' },
          { phone: '+919847000002' },
        ],
      })
    ).json().items as Entry[];
    const kept = first.find((entry) => entry.phone === '+919847000001')!;
    const second = (
      await send(person, 'PUT', '/block-list', {
        // The kept number is written another way and gets a new reason; one entry is dropped; one is new
        items: [
          { phone: '09847000001', reason: 'new reason' },
          { email: 'b@spam.example' },
          { phone: '+919847000002' },
        ],
      })
    ).json().items as Entry[];
    expect(second).toHaveLength(3);
    const keptAfter = second.find((entry) => entry.phone === '+919847000001')!;
    expect(keptAfter.id).toBe(kept.id);
    expect(keptAfter.createdAt).toBe(kept.createdAt);
    expect(keptAfter.reason).toBe('new reason');
    expect(second.some((entry) => entry.email === 'a@spam.example')).toBe(false);
    expect(second.some((entry) => entry.email === 'b@spam.example')).toBe(true);
  });

  it('clears the list with an empty list', async () => {
    const person = await newBusiness();
    await send(person, 'PUT', '/block-list', { items: [{ phone: uniqueIndianNumber() }] });
    const response = await send(person, 'PUT', '/block-list', { items: [] });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('answers 400 for the same number or email twice, however it is written', async () => {
    const person = await newBusiness();
    const twiceNumber = await send(person, 'PUT', '/block-list', {
      items: [{ phone: '+91 98470 12345' }, { phone: '098470 12345' }],
    });
    expect(twiceNumber.statusCode).toBe(400);
    expect(twiceNumber.json().error.code).toBe('DUPLICATE_BLOCK_ENTRY');
    const twiceEmail = await send(person, 'PUT', '/block-list', {
      items: [{ email: 'a@x.example' }, { email: 'A@X.EXAMPLE' }],
    });
    expect(twiceEmail.statusCode).toBe(400);
    expect(twiceEmail.json().error.code).toBe('DUPLICATE_BLOCK_ENTRY');
    expect((await send(person, 'GET', '/block-list')).json().items).toEqual([]);
  });

  it('answers 400 INVALID_BLOCK_PHONE for something that cannot be a phone number, and changes nothing', async () => {
    const person = await newBusiness();
    await send(person, 'PUT', '/block-list', { items: [{ phone: '+919847000009' }] });
    const response = await send(person, 'PUT', '/block-list', {
      items: [{ phone: '+919847000008' }, { phone: 'not a number' }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BLOCK_PHONE');
    // The list is as it was
    const items = (await send(person, 'GET', '/block-list')).json().items as Entry[];
    expect(items.map((entry) => entry.phone)).toEqual(['+919847000009']);
  });

  it('answers 400 for bad input: both or neither of phone and email, a bad email, a long reason, an unknown field, no list, too many entries', async () => {
    const person = await newBusiness();
    const bad = [
      { items: [{ phone: '+919847000001', email: 'a@b.example' }] },
      { items: [{}] },
      { items: [{ email: 'not-an-email' }] },
      { items: [{ email: 'a@b.example', reason: 'x'.repeat(201) }] },
      { items: [{ email: 'a@b.example', note: 'hello' }] },
      { items: [{ email: 'a@b.example' }], extra: true },
      {},
      { items: Array.from({ length: 501 }, (_unused, number) => ({ email: `person${number}@spam.example` })) },
    ];
    for (const body of bad) {
      expect((await send(person, 'PUT', '/block-list', body)).statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
  });

  it('answers 403 to staff who are not managers, 401 to nobody, and 403 without the safety headers', async () => {
    const person = await newBusiness();
    const body = { items: [{ email: 'a@b.example' }] };
    expect((await send(null, 'PUT', '/block-list', body)).statusCode).toBe(401);
    expect((await send(person, 'PUT', '/block-list', body, false)).statusCode).toBe(403);
    await setRole(person, 'staff');
    expect((await send(person, 'PUT', '/block-list', body)).statusCode).toBe(403);
    await setRole(person, 'staff_own');
    expect((await send(person, 'PUT', '/block-list', body)).statusCode).toBe(403);
  });

  it('keeps each business separate: the same number can be blocked by two businesses', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    const number = uniqueIndianNumber();
    await send(first, 'PUT', '/block-list', { items: [{ phone: number, reason: 'only for the first' }] });
    expect((await send(second, 'GET', '/block-list')).json().items).toEqual([]);
    const response = await send(second, 'PUT', '/block-list', { items: [{ phone: number }] });
    expect(response.statusCode, response.body).toBe(200);
    expect((await send(first, 'GET', '/block-list')).json().items[0].reason).toBe('only for the first');
  });

  it('never ends up with the same number twice when two saves arrive together', async () => {
    const person = await newBusiness();
    const number = uniqueIndianNumber();
    const answers = await Promise.all([
      send(person, 'PUT', '/block-list', { items: [{ phone: number }] }),
      send(person, 'PUT', '/block-list', { items: [{ phone: number, reason: 'second save' }] }),
    ]);
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200]);
    expect(
      ((await send(person, 'GET', '/block-list')).json().items as Entry[]).filter((entry) => entry.phone === number),
    ).toHaveLength(1);
  });

  it('writes an activity-log line that holds no number, no email and no reason', async () => {
    const person = await newBusiness();
    const secret = `secret-${randomUUID().slice(0, 8)}`;
    await send(person, 'PUT', '/block-list', { items: [{ email: `${secret}@spam.example`, reason: secret }] });
    // Saving the same list again changes nothing, so it writes no second line
    await send(person, 'PUT', '/block-list', { items: [{ email: `${secret}@spam.example`, reason: secret }] });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'conversations.block_list_replaced')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).not.toContain(secret);
  });

  it('refuses at the database an entry with both a number and an email, or neither', async () => {
    const person = await newBusiness();
    const insert = (values: { phone_key: string | null; email: string | null }) =>
      database.system
        .insertInto('block_list')
        .values({ id: randomUUID(), account_id: person.profile.business.id, reason: null, ...values })
        .execute();
    await expect(insert({ phone_key: '919847000001', email: 'a@b.example' })).rejects.toThrow(
      /block_list_phone_or_email/,
    );
    await expect(insert({ phone_key: null, email: null })).rejects.toThrow(/block_list_phone_or_email/);
  });
});
