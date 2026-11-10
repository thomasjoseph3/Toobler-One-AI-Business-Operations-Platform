import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, TEST_PASSWORD, type SignedInPerson } from './support/auth';
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

/** POST /auth/logout as a person (or with nobody signed in). */
const logout = (person: SignedInPerson | null, extraHeaders: Record<string, string> = unsafeRequestHeaders) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { ...extraHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

const getMe = (person: SignedInPerson) => app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });

describe('POST /api/v1/auth/logout', () => {
  it('ends the session at once: the same cookie stops working straight away', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await getMe(person)).statusCode).toBe(200);

    const response = await logout(person);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const afterwards = await getMe(person);
    expect(afterwards.statusCode).toBe(401);
    expect(afterwards.json().error.code).toBe('SESSION_ENDED');
  });

  it('tells the browser to delete both cookies', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await logout(person);
    const access = response.cookies.find((cookie) => cookie.name === 'toobler_access');
    const refresh = response.cookies.find((cookie) => cookie.name === 'toobler_refresh');
    // A deleted cookie is sent back empty and already expired, on the same paths it was set with
    expect(access).toMatchObject({ value: '', path: '/api' });
    expect(refresh).toMatchObject({ value: '', path: '/api/v1/auth/refresh' });
    expect(access?.expires?.getTime()).toBeLessThan(Date.now());
    expect(refresh?.expires?.getTime()).toBeLessThan(Date.now());
  });

  it('records the session as ended, and writes the sign-out to the activity log', async () => {
    const person = await createSignedInPerson(app, database);
    await logout(person);
    const session = await database.system
      .selectFrom('sessions')
      .select(['revoked_at', 'revoked_reason'])
      .where('user_id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(session.revoked_at).not.toBeNull();
    expect(session.revoked_reason).toBe('signed out');
    const kinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', person.profile.business.id)
      .orderBy('created_at')
      .execute();
    expect(kinds.map((line) => line.kind)).toEqual(['auth.signed_up', 'auth.signed_in', 'auth.signed_out']);
  });

  it('ends only this device: the same person signed in elsewhere stays signed in', async () => {
    const first = await createSignedInPerson(app, database);
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: unsafeRequestHeaders,
      payload: { email: first.email, password: TEST_PASSWORD },
    });
    const otherDevice: SignedInPerson = {
      ...first,
      cookieHeader: `toobler_access=${secondLogin.cookies.find((cookie) => cookie.name === 'toobler_access')!.value}`,
    };

    await logout(first);
    expect((await getMe(first)).statusCode).toBe(401);
    expect((await getMe(otherDevice)).statusCode).toBe(200);
  });

  it('cannot be done twice with the same cookie, and needs a session at all', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await logout(person)).statusCode).toBe(200);
    expect((await logout(person)).statusCode).toBe(401); // already ended
    const nobody = await logout(null);
    expect(nobody.statusCode).toBe(401);
    expect(nobody.json().error.code).toBe('UNAUTHORIZED');
  });

  it('needs our Origin and X-Requested-With headers, so another website cannot sign someone out (CSRF)', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await logout(person, {});
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF_REJECTED');
    expect((await getMe(person)).statusCode).toBe(200); // still signed in
  });
});
