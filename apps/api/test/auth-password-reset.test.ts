import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { hashSecret } from '../src/modules/core/auth/helpers/tokens';
import { buildTestApp, captureLogs, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, TEST_PASSWORD, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';

let database: Database;
let app: FastifyInstance;
let mail: RecordingMailSender;

const NEW_PASSWORD = 'planet-orange-bridge-77';

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  app = await buildTestApp(database, [], { mailSender: mail });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const forgotPassword = (email: unknown, headers: Record<string, string> = unsafeRequestHeaders) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/forgot-password', headers, payload: { email } as object });

const resetPassword = (token: unknown, newPassword: unknown, headers: Record<string, string> = unsafeRequestHeaders) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/reset-password',
    headers,
    payload: { token, newPassword } as object,
  });

const signIn = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: unsafeRequestHeaders,
    payload: { email, password },
  });

const getMe = (person: SignedInPerson) => app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });

/** A signed-in person who has asked for a reset link; returns them and the token from their email. */
async function personWithResetToken() {
  const person = await createSignedInPerson(app, database);
  mail.sent.length = 0;
  expect((await forgotPassword(person.email)).statusCode).toBe(200);
  const token = mail.latestTokenFor(person.email);
  expect(token).toBeDefined();
  return { person, token: token! };
}

describe('POST /api/v1/auth/forgot-password', () => {
  it('emails a reset link to a real, active person and answers { ok: true }', async () => {
    const person = await createSignedInPerson(app, database);
    mail.sent.length = 0;
    const response = await forgotPassword(person.email);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const messages = mail.sent.filter((message) => message.to === person.email);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.text).toContain('/reset-password?token=');
  });

  it('answers exactly the same for an email with no account, and sends nothing', async () => {
    const real = await createSignedInPerson(app, database);
    mail.sent.length = 0;
    const known = await forgotPassword(real.email);
    const unknown = await forgotPassword(`nobody-${randomUUID().slice(0, 8)}@example.com`);
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toBe(known.body);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(real.email);
  });

  it('sends nothing to a disabled person, and still answers the same', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', person.profile.user.id)
      .execute();
    mail.sent.length = 0;
    const response = await forgotPassword(person.email);
    expect(response.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(0);
  });

  it('treats the email without regard to case and spaces', async () => {
    const person = await createSignedInPerson(app, database);
    mail.sent.length = 0;
    await forgotPassword(`  ${person.email.toUpperCase()} `);
    expect(mail.sent.filter((message) => message.to === person.email)).toHaveLength(1);
  });

  it('stores only a hash of the link, never the link itself, and keeps only the newest link working', async () => {
    const person = await createSignedInPerson(app, database);
    await forgotPassword(person.email);
    const first = mail.latestTokenFor(person.email)!;
    await forgotPassword(person.email);
    const second = mail.latestTokenFor(person.email)!;
    expect(second).not.toBe(first);

    const rows = await database.system
      .selectFrom('auth_tokens')
      .select(['token_hash', 'purpose'])
      .where('user_id', '=', person.profile.user.id)
      .where('purpose', '=', 'reset_password')
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(hashSecret(second));
    expect(JSON.stringify(rows)).not.toContain(second);

    expect((await resetPassword(first, NEW_PASSWORD)).statusCode).toBe(400);
    expect((await resetPassword(second, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('still answers { ok: true } when the mail server is down (nothing leaks), and logs no address or link', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger, mailSender: mail });
    const person = await createSignedInPerson(loggingApp, database);
    mail.failNextSends(true);
    const response = await loggingApp.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: unsafeRequestHeaders,
      payload: { email: person.email },
    });
    mail.failNextSends(false);
    expect(response.statusCode).toBe(200);
    const logged = text();
    expect(logged).toContain('could not send the reset email');
    expect(logged).not.toContain(person.email);
    expect(logged).not.toContain('token=');
    await loggingApp.close();
  });

  it('rejects a body that is not an email (400) and a request without our headers (403)', async () => {
    expect((await forgotPassword('not-an-email')).statusCode).toBe(400);
    expect((await forgotPassword(undefined)).statusCode).toBe(400);
    const response = await forgotPassword('someone@example.com', {});
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF_REJECTED');
  });

  it('is limited to 3 requests per 10 minutes for one address', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true, mailSender: mail });
    const statusCodes: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await strictApp.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        headers: unsafeRequestHeaders,
        payload: { email: `nobody-${randomUUID().slice(0, 8)}@example.com` },
      });
      statusCodes.push(response.statusCode);
    }
    expect(statusCodes).toEqual([200, 200, 200, 429, 429]);
    await strictApp.close();
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  it('sets the new password: the new one signs in, the old one no longer does', async () => {
    const { person, token } = await personWithResetToken();
    const response = await resetPassword(token, NEW_PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect((await signIn(person.email, NEW_PASSWORD)).statusCode).toBe(200);
    const oldPassword = await signIn(person.email, TEST_PASSWORD);
    expect(oldPassword.statusCode).toBe(401);
    expect(oldPassword.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not sign the person in (no cookies are set)', async () => {
    const { token } = await personWithResetToken();
    const response = await resetPassword(token, NEW_PASSWORD);
    expect(response.cookies).toHaveLength(0);
  });

  it('ends every session on every device, including the refresh token', async () => {
    const { person, token } = await personWithResetToken();
    const otherDevice = await signIn(person.email, TEST_PASSWORD);
    const otherCookie = `toobler_access=${otherDevice.cookies.find((cookie) => cookie.name === 'toobler_access')!.value}`;
    expect((await getMe(person)).statusCode).toBe(200);

    await resetPassword(token, NEW_PASSWORD);

    expect((await getMe(person)).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: otherCookie } })).statusCode).toBe(401);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { ...unsafeRequestHeaders, cookie: `toobler_refresh=${person.refreshToken}` },
    });
    expect(refresh.statusCode).toBe(401);
    const sessions = await database.system
      .selectFrom('sessions')
      .select(['revoked_at', 'revoked_reason'])
      .where('user_id', '=', person.profile.user.id)
      .execute();
    expect(sessions.every((session) => session.revoked_at !== null)).toBe(true);
    expect(sessions.every((session) => session.revoked_reason === 'password reset')).toBe(true);
  });

  it('clears a lockout, so a locked-out person can get back in with the new password', async () => {
    const { person, token } = await personWithResetToken();
    for (let attempt = 0; attempt < 5; attempt += 1) await signIn(person.email, 'wrong-password-123');
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(429);

    await resetPassword(token, NEW_PASSWORD);
    expect((await signIn(person.email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('works once: the same link used again is refused', async () => {
    const { token } = await personWithResetToken();
    expect((await resetPassword(token, NEW_PASSWORD)).statusCode).toBe(200);
    const again = await resetPassword(token, 'another-good-password-9');
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('INVALID_TOKEN');
  });

  it('gives one answer for a made-up, expired, wrong-purpose or disabled-person link', async () => {
    const madeUp = await resetPassword('x'.repeat(43), NEW_PASSWORD);

    const expired = await personWithResetToken();
    await database.system
      .updateTable('auth_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token_hash', '=', hashSecret(expired.token))
      .execute();
    const expiredAnswer = await resetPassword(expired.token, NEW_PASSWORD);

    // A verification link must not work as a reset link
    const verifying = await createSignedInPerson(app, database, { verified: false });
    const verifyToken = mail.latestTokenFor(verifying.email)!;
    const wrongPurpose = await resetPassword(verifyToken, NEW_PASSWORD);

    const disabled = await personWithResetToken();
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', disabled.person.profile.user.id)
      .execute();
    const disabledAnswer = await resetPassword(disabled.token, NEW_PASSWORD);

    for (const response of [madeUp, expiredAnswer, wrongPurpose, disabledAnswer]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    }
    expect(new Set([madeUp, expiredAnswer, wrongPurpose, disabledAnswer].map((response) => response.body)).size).toBe(
      1,
    );
  });

  it('refuses a weak password with 400, and the link still works for another try', async () => {
    const { person, token } = await personWithResetToken();
    const tooShort = await resetPassword(token, 'short');
    expect(tooShort.statusCode).toBe(400);

    const common = await resetPassword(token, 'Password123!');
    expect(common.statusCode).toBe(400);
    expect(common.json().error.code).toBe('WEAK_PASSWORD');

    const theEmail = await resetPassword(token, person.email);
    expect(theEmail.json().error.code).toBe('WEAK_PASSWORD');

    // Nothing changed, and the link was not used up by the refused tries
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
    expect((await resetPassword(token, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('counts as proof of the email: an unverified person becomes verified', async () => {
    const person = await createSignedInPerson(app, database, { verified: false });
    await forgotPassword(person.email);
    const token = mail.latestTokenFor(person.email)!;
    await resetPassword(token, NEW_PASSWORD);
    const row = await database.system
      .selectFrom('users')
      .select('email_verified_at')
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.email_verified_at).not.toBeNull();
  });

  it('writes to the activity log without the password or the token', async () => {
    const { person, token } = await personWithResetToken();
    await resetPassword(token, NEW_PASSWORD);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'auth.password_reset')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(lines)).not.toContain(token);
  });

  it('stores the new password only as a hash', async () => {
    const { person, token } = await personWithResetToken();
    await resetPassword(token, NEW_PASSWORD);
    const row = await database.system
      .selectFrom('user_credentials')
      .select('password_hash')
      .where('user_id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(NEW_PASSWORD);
  });

  it('rejects a bad body (400) and a request without our headers (403, and the link is not used)', async () => {
    const { person, token } = await personWithResetToken();
    expect((await resetPassword(undefined, NEW_PASSWORD)).statusCode).toBe(400);
    expect((await resetPassword(token, undefined)).statusCode).toBe(400);
    expect((await resetPassword('short', NEW_PASSWORD)).statusCode).toBe(400);
    const noHeaders = await resetPassword(token, NEW_PASSWORD, {});
    expect(noHeaders.statusCode).toBe(403);
    expect(noHeaders.json().error.code).toBe('CSRF_REJECTED');
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200); // password unchanged
  });

  it('two requests with the same link at the same moment: only one succeeds', async () => {
    const { token } = await personWithResetToken();
    const [first, second] = await Promise.all([
      resetPassword(token, NEW_PASSWORD),
      resetPassword(token, 'another-good-password-9'),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400]);
  });

  it('is limited to 10 tries a minute for one address', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const statusCodes: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await strictApp.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        headers: unsafeRequestHeaders,
        payload: { token: 'x'.repeat(43), newPassword: NEW_PASSWORD },
      });
      statusCodes.push(response.statusCode);
    }
    expect(statusCodes.slice(0, 10).every((statusCode) => statusCode === 400)).toBe(true);
    expect(statusCodes.slice(10)).toEqual([429, 429]);
    await strictApp.close();
  });
});
