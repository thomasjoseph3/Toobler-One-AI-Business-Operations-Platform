import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { hashSecret, verifyAccessToken } from '../src/modules/core/auth/helpers/tokens';
import { buildTestApp, captureLogs, testConfig, unsafeRequestHeaders } from './support/app';
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

const PASSWORD = 'river-lamp-kettle-42';

/** Signs a new owner up (through the real sign-up route) and returns their email and ids. */
async function signUpPerson(testApp: FastifyInstance = app) {
  const email = `person-${randomUUID().slice(0, 8)}@example.com`;
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    headers: unsafeRequestHeaders,
    payload: {
      name: 'Anita Nair',
      businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
      email,
      mobile: '+91 98470 12345',
      password: PASSWORD,
      industry: 'hotel_resort',
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return { email, profile: response.json() };
}

const postLogin = (payload: unknown, headers: Record<string, string> = {}, testApp: FastifyInstance = app) =>
  testApp.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: payload as object,
    headers: { ...unsafeRequestHeaders, ...headers },
  });

describe('POST /api/v1/auth/login', () => {
  it('signs a person in: answers with the profile and sets the two cookies', async () => {
    const { email, profile } = await signUpPerson();
    const response = await postLogin({ email, password: PASSWORD });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(profile); // the same profile sign-up gave
    const access = response.cookies.find((cookie) => cookie.name === 'toobler_access');
    const refresh = response.cookies.find((cookie) => cookie.name === 'toobler_refresh');
    // Both are httpOnly (browser scripts cannot read them); the refresh one only goes to the refresh address
    expect(access).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api', maxAge: 15 * 60 });
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1/auth/refresh' });
    // The tokens travel only in cookies, never in the body
    expect(response.body).not.toContain(access!.value);
    expect(response.body).not.toContain(refresh!.value);
    expect(response.body).not.toMatch(/token|hash|password/i);
  });

  it('gives an access token that names the person and the session, and signs only for 15 minutes', async () => {
    const { email, profile } = await signUpPerson();
    const response = await postLogin({ email, password: PASSWORD });
    const accessValue = response.cookies.find((cookie) => cookie.name === 'toobler_access')!.value;

    const claims = await verifyAccessToken(accessValue, testConfig().auth.jwtSecret);
    expect(claims.userId).toBe(profile.user.id);
    const session = await database.system
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', profile.user.id)
      .executeTakeFirstOrThrow();
    expect(claims.sessionId).toBe(session.id);
    await expect(
      verifyAccessToken(accessValue, testConfig().auth.jwtSecret, new Date(Date.now() + 16 * 60_000)),
    ).rejects.toMatchObject({ reason: 'expired' });
  });

  it('records the session with only a hash of the refresh token, and who signed in from where', async () => {
    const { email, profile } = await signUpPerson();
    const response = await postLogin({ email, password: PASSWORD }, { 'user-agent': 'PostmanRuntime/7.0 test' });
    const refreshValue = response.cookies.find((cookie) => cookie.name === 'toobler_refresh')!.value;

    const session = await database.system
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', profile.user.id)
      .executeTakeFirstOrThrow();
    expect(session.refresh_token_hash).toBe(hashSecret(refreshValue));
    expect(session.refresh_token_hash).not.toContain(refreshValue);
    expect(session).toMatchObject({ user_agent: 'PostmanRuntime/7.0 test', revoked_at: null });
    expect(session.expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000); // about 30 days
  });

  it('notes the sign-in on the person and in the activity log', async () => {
    const { email, profile } = await signUpPerson();
    await postLogin({ email, password: PASSWORD });
    const person = await database.system
      .selectFrom('users')
      .select('last_login_at')
      .where('id', '=', profile.user.id)
      .executeTakeFirstOrThrow();
    expect(person.last_login_at).not.toBeNull();
    const kinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', profile.business.id)
      .orderBy('created_at')
      .execute();
    expect(kinds.map((line) => line.kind)).toEqual(['auth.signed_up', 'auth.signed_in']);
  });

  it('starts a new session every time, and treats the email without regard to letter case', async () => {
    const { email, profile } = await signUpPerson();
    const first = await postLogin({ email, password: PASSWORD });
    const second = await postLogin({ email: email.toUpperCase(), password: PASSWORD });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const sessions = await database.system
      .selectFrom('sessions')
      .select('refresh_token_hash')
      .where('user_id', '=', profile.user.id)
      .execute();
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((session) => session.refresh_token_hash)).size).toBe(2);
  });

  it('answers a wrong password, an unknown email and a disabled person exactly the same', async () => {
    const { email, profile } = await signUpPerson();
    const wrongPassword = await postLogin({ email, password: 'not-the-password-1' });
    const unknownEmail = await postLogin({
      email: `ghost-${randomUUID().slice(0, 8)}@example.com`,
      password: PASSWORD,
    });
    await database.system.updateTable('users').set({ status: 'disabled' }).where('id', '=', profile.user.id).execute();
    const disabled = await postLogin({ email, password: PASSWORD });

    for (const response of [wrongPassword, unknownEmail, disabled]) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
      expect(response.cookies).toEqual([]); // nothing is set when sign-in fails
    }
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
    expect(disabled.json()).toEqual(wrongPassword.json());
    const sessions = await database.system
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', profile.user.id)
      .execute();
    expect(sessions).toEqual([]); // no session was opened by any of them
  });

  it('refuses bad input with a 400 that names the field', async () => {
    const attempts: [unknown, string][] = [
      [{ email: 'not-an-email', password: PASSWORD }, 'email'],
      [{ email: 'a@example.com', password: '' }, 'password'],
      [{ email: 'a@example.com' }, 'password'],
      [{ password: PASSWORD }, 'email'],
    ];
    for (const [payload, field] of attempts) {
      const response = await postLogin(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().error.details).toEqual([expect.objectContaining({ path: field })]);
    }
    expect((await postLogin({})).statusCode).toBe(400);
  });

  it('cannot be used to read sessions: the fenced app role cannot see them', async () => {
    const { email, profile } = await signUpPerson();
    await postLogin({ email, password: PASSWORD });
    await expect(
      database.runInAccountTransaction(profile.business.id, (transaction) =>
        transaction.selectFrom('sessions').selectAll().execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps passwords, tokens and email addresses out of the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger });
    const { email } = await signUpPerson(loggingApp);
    await postLogin({ email, password: 'wrong-password-for-the-log-test' }, {}, loggingApp);
    const response = await postLogin({ email, password: PASSWORD }, {}, loggingApp);
    const secrets = [
      PASSWORD,
      'wrong-password-for-the-log-test',
      email,
      ...response.cookies.map((cookie) => cookie.value),
    ];
    const logged = text();
    expect(logged).toContain('/api/v1/auth/login'); // the logger was really recording
    for (const secret of secrets) expect(logged, `the log contains "${secret.slice(0, 12)}..."`).not.toContain(secret);
    await loggingApp.close();
  });
});
