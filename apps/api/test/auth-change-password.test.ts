import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, TEST_PASSWORD, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

const NEW_PASSWORD = 'planet-orange-bridge-77';

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** POST /me/password as a person (or with nobody signed in). */
const changePassword = (
  person: SignedInPerson | null,
  payload: unknown,
  headers: Record<string, string> = unsafeRequestHeaders,
  testApp: FastifyInstance = app,
) =>
  testApp.inject({
    method: 'POST',
    url: '/api/v1/me/password',
    headers: { ...headers, ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: payload as object,
  });

const signIn = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: unsafeRequestHeaders,
    payload: { email, password },
  });

const getMe = (person: SignedInPerson) => app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });

describe('POST /api/v1/me/password', () => {
  it('changes the password: the new one signs in, the old one no longer does', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await changePassword(person, { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect((await signIn(person.email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(401);
  });

  it('keeps this device signed in and signs every other device out', async () => {
    const person = await createSignedInPerson(app, database);
    const otherLogin = await signIn(person.email, TEST_PASSWORD);
    const otherDevice: SignedInPerson = {
      ...person,
      cookieHeader: `toobler_access=${otherLogin.cookies.find((cookie) => cookie.name === 'toobler_access')!.value}`,
    };
    expect((await getMe(otherDevice)).statusCode).toBe(200);

    await changePassword(person, { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    expect((await getMe(person)).statusCode).toBe(200); // the device that changed it
    const ended = await getMe(otherDevice);
    expect(ended.statusCode).toBe(401);
    expect(ended.json().error.code).toBe('SESSION_ENDED');
  });

  it('refuses a wrong current password (400 WRONG_PASSWORD) and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await changePassword(person, { currentPassword: 'not-my-password-1', newPassword: NEW_PASSWORD });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('WRONG_PASSWORD');
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
    expect((await signIn(person.email, NEW_PASSWORD)).statusCode).toBe(401);
  });

  it('refuses a weak, common or unchanged new password (400 WEAK_PASSWORD)', async () => {
    const person = await createSignedInPerson(app, database);
    for (const newPassword of ['Password123!', person.email, TEST_PASSWORD]) {
      const response = await changePassword(person, { currentPassword: TEST_PASSWORD, newPassword });
      expect(response.statusCode, newPassword).toBe(400);
      expect(response.json().error.code).toBe('WEAK_PASSWORD');
    }
    expect((await changePassword(person, { currentPassword: TEST_PASSWORD, newPassword: 'short' })).statusCode).toBe(
      400,
    );
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('stores the new password only as a hash, and records the change without any password', async () => {
    const person = await createSignedInPerson(app, database);
    await changePassword(person, { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    const credentials = await database.system
      .selectFrom('user_credentials')
      .select('password_hash')
      .where('user_id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(credentials.password_hash).toMatch(/^\$argon2id\$/);
    expect(credentials.password_hash).not.toContain(NEW_PASSWORD);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'auth.password_changed')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(lines)).not.toContain(TEST_PASSWORD);
  });

  it('changes only the signed-in person’s password, never another person’s', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await changePassword(first, { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect((await signIn(second.email, TEST_PASSWORD)).statusCode).toBe(200);
    expect((await getMe(second)).statusCode).toBe(200);
  });

  it('needs a session (401), a verified email (403), a good body (400) and our headers (403 CSRF)', async () => {
    const body = { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD };
    expect((await changePassword(null, body)).statusCode).toBe(401);

    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await changePassword(unverified, body)).json().error.code).toBe('EMAIL_NOT_VERIFIED');

    const person = await createSignedInPerson(app, database);
    expect((await changePassword(person, {})).statusCode).toBe(400);
    expect((await changePassword(person, { currentPassword: TEST_PASSWORD })).statusCode).toBe(400);
    const noHeaders = await changePassword(person, body, {});
    expect(noHeaders.statusCode).toBe(403);
    expect(noHeaders.json().error.code).toBe('CSRF_REJECTED');
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('is limited to 5 tries per 10 minutes, so a stolen session cannot guess the current password', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const person = await createSignedInPerson(strictApp, database);
    const statusCodes: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await changePassword(
        person,
        { currentPassword: `wrong-guess-number-${attempt}`, newPassword: NEW_PASSWORD },
        unsafeRequestHeaders,
        strictApp,
      );
      statusCodes.push(response.statusCode);
    }
    expect(statusCodes).toEqual([400, 400, 400, 400, 400, 429, 429]);
    await strictApp.close();
  });
});
