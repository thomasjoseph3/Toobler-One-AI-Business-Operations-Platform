import { verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
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

/** A sign-up request that is valid, with an email and business name no other test uses. */
function validSignUp(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Anita Nair',
    businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
    email: `person-${randomUUID().slice(0, 8)}@example.com`,
    mobile: '+91 98470 12345',
    password: 'river-lamp-kettle-42',
    industry: 'hotel_resort',
    ...overrides,
  };
}

const postSignUp = (payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    headers: unsafeRequestHeaders,
    payload: payload as object,
  });

describe('POST /api/v1/auth/signup', () => {
  it('creates the business and its owner, and answers with the profile', async () => {
    const body = validSignUp();
    const response = await postSignUp(body);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: { name: 'Anita Nair', email: body.email, mobile: '+919847012345', role: 'manager' },
      business: { name: body.businessName, industry: 'hotel_resort', timeZone: 'Asia/Kolkata' },
    });
    // The answer never contains the password or a hash
    expect(response.body).not.toContain(body.password);
    expect(response.body).not.toMatch(/hash|argon/i);
  });

  it('saves exactly what it should: one business, one owner, a hash instead of the password, one activity line', async () => {
    const body = validSignUp({ email: 'Mixed.Case@Example.com' });
    const profile = (await postSignUp(body)).json();

    const user = await database.system
      .selectFrom('users')
      .selectAll()
      .where('id', '=', profile.user.id)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({
      account_id: profile.business.id,
      email: 'mixed.case@example.com', // stored in lower case
      role: 'manager',
      status: 'active',
      mobile_e164: '+919847012345',
      mobile_key: '9847012345',
    });

    const credentials = await database.system
      .selectFrom('user_credentials')
      .selectAll()
      .where('user_id', '=', profile.user.id)
      .executeTakeFirstOrThrow();
    expect(credentials.password_hash).toMatch(/^\$argon2id\$/);
    expect(credentials.password_hash).not.toContain(body.password);
    expect(await verify(credentials.password_hash, body.password)).toBe(true);

    const account = await database.system
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', profile.business.id)
      .executeTakeFirstOrThrow();
    expect(account).toMatchObject({ name: body.businessName, industry: 'hotel_resort', time_zone: 'Asia/Kolkata' });

    const activity = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'record_id'])
      .where('account_id', '=', profile.business.id)
      .execute();
    expect(activity).toEqual([{ kind: 'auth.signed_up', record_id: profile.user.id }]);
  });

  it('refuses bad input with a clear code for each problem, and saves nothing', async () => {
    const attempts: [Record<string, unknown>, string][] = [
      [{ email: 'not-an-email' }, 'VALIDATION_ERROR'],
      [{ password: 'short' }, 'VALIDATION_ERROR'],
      [{ businessName: '' }, 'VALIDATION_ERROR'],
      [{ name: '' }, 'VALIDATION_ERROR'],
      [{ industry: '' }, 'VALIDATION_ERROR'],
      [{ industry: 'spaceships' }, 'INVALID_INDUSTRY'], // not on the list from GET /industries
      [{ mobile: 'abcdefgh1' }, 'INVALID_MOBILE'],
      [{ mobile: '12345' }, 'INVALID_MOBILE'],
      [{ password: '9847012345' }, 'WEAK_PASSWORD'],
    ];
    for (const [overrides, expectedCode] of attempts) {
      const body = validSignUp(overrides);
      const response = await postSignUp(body);
      expect(response.statusCode, JSON.stringify(overrides)).toBe(400);
      expect(response.json().error.code, JSON.stringify(overrides)).toBe(expectedCode);
      const saved = await database.system
        .selectFrom('users')
        .select('id')
        .where('email', '=', String(body.email).toLowerCase())
        .execute();
      expect(saved, `nothing is saved for ${JSON.stringify(overrides)}`).toEqual([]);
    }
    expect((await postSignUp({})).statusCode).toBe(400);
    expect((await postSignUp(undefined)).statusCode).toBe(400);
  });

  it('names the field that is wrong', async () => {
    const response = await postSignUp(validSignUp({ email: 'not-an-email' }));
    expect(response.json().error.details).toEqual([expect.objectContaining({ path: 'email' })]);
  });

  it('only accepts industries that are on the list, and not ones that have been switched off', async () => {
    for (const industry of ['general', 'clinic', 'other']) {
      expect((await postSignUp(validSignUp({ industry }))).statusCode, industry).toBe(201);
    }
    await database.system.updateTable('industries').set({ is_active: false }).where('id', '=', 'education').execute();
    try {
      const refused = await postSignUp(validSignUp({ industry: 'education' }));
      expect(refused.statusCode).toBe(400);
      expect(refused.json().error.code).toBe('INVALID_INDUSTRY');
    } finally {
      await database.system.updateTable('industries').set({ is_active: true }).where('id', '=', 'education').execute();
    }
  });

  it('lets one email manage one business: a second sign-up with it is refused, whatever the letter case', async () => {
    const first = validSignUp();
    expect((await postSignUp(first)).statusCode).toBe(201);
    const again = await postSignUp(validSignUp({ email: String(first.email).toUpperCase() }));
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('EMAIL_TAKEN');
    const people = await database.system.selectFrom('users').select('id').where('email', '=', first.email).execute();
    expect(people).toHaveLength(1);
  });

  it('creates exactly one account when two sign-ups with the same email arrive together', async () => {
    const email = `race-${randomUUID().slice(0, 8)}@example.com`;
    const results = await Promise.all([postSignUp(validSignUp({ email })), postSignUp(validSignUp({ email }))]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    const businesses = await database.system
      .selectFrom('users')
      .select('account_id')
      .where('email', '=', email)
      .execute();
    expect(businesses).toHaveLength(1);
  });

  it('saves all or nothing: when the owner cannot be saved, the business is not left behind', async () => {
    // A name with a NUL character passes our checks but the database refuses it. The business is inserted first and
    // the owner second, so the second insert fails after the first has happened: the whole transaction must roll back.
    const businessName = `Rolled back ${randomUUID().slice(0, 8)}`;
    const response = await postSignUp(validSignUp({ businessName, name: 'Bad\u0000Name' }));
    expect(response.statusCode).toBe(500);
    const leftBehind = await database.system
      .selectFrom('accounts')
      .select('id')
      .where('name', '=', businessName)
      .execute();
    expect(leftBehind).toEqual([]);
  });

  it('gives each business only its own people: a fenced query sees one business, not the other', async () => {
    const first = (await postSignUp(validSignUp())).json();
    const second = (await postSignUp(validSignUp())).json();
    const seenByFirst = await database.runInAccountTransaction(first.business.id, async (transaction) => ({
      people: (await transaction.selectFrom('users').select('id').execute()).map((row) => row.id),
      businesses: (await transaction.selectFrom('accounts').select('id').execute()).map((row) => row.id),
    }));
    expect(seenByFirst.people).toEqual([first.user.id]);
    expect(seenByFirst.businesses).toEqual([first.business.id]);
    expect(seenByFirst.people).not.toContain(second.user.id);
  });

  it('cannot be read by the app role: the fenced connection cannot see password hashes', async () => {
    const profile = (await postSignUp(validSignUp())).json();
    await expect(
      database.runInAccountTransaction(profile.business.id, (transaction) =>
        transaction.selectFrom('user_credentials').selectAll().execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
