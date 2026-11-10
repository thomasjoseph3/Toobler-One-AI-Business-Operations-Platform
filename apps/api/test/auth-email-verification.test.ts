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

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  app = await buildTestApp(database, [], { mailSender: mail });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const verifyEmail = (token: unknown, headers: Record<string, string> = unsafeRequestHeaders) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', headers, payload: { token } as object });

const resendEmail = (person: SignedInPerson | null, headers: Record<string, string> = unsafeRequestHeaders) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/resend-email',
    headers: { ...headers, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

const getMe = (person: SignedInPerson) => app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });

/** Signs up a new owner through the real route; returns their email and the token from the email they were sent. */
async function signUpAndGetToken() {
  const email = `person-${randomUUID().slice(0, 8)}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    headers: unsafeRequestHeaders,
    payload: {
      name: 'Anita Nair',
      businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
      email,
      mobile: '+91 98470 12345',
      password: TEST_PASSWORD,
      industry: 'hotel_resort',
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return { email, userId: response.json().user.id as string, token: mail.latestTokenFor(email)! };
}

describe('sign-up sends the verification email', () => {
  it('emails the owner a link, and says in the answer that the email is not verified yet', async () => {
    const { email, token } = await signUpAndGetToken();
    const message = mail.sent.filter((sent) => sent.to === email);
    expect(message).toHaveLength(1);
    expect(message[0]?.subject).toMatch(/confirm your email/i);
    expect(message[0]?.text).toContain(`http://localhost:3000/verify-email?token=${token}`);
    expect(message[0]?.html).toContain('Confirm my email');
    expect(token.length).toBeGreaterThan(30);
  });

  it('stores only a hash of the link, never the link itself', async () => {
    const { userId, token } = await signUpAndGetToken();
    const rows = await database.system.selectFrom('auth_tokens').selectAll().where('user_id', '=', userId).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(hashSecret(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('still creates the account when the mail server is down, and logs the problem without the address or link', async () => {
    const { logger, text } = captureLogs();
    const failingMail = createRecordingMailSender();
    failingMail.failNextSends(true);
    const loggingApp = await buildTestApp(database, [], { logger, mailSender: failingMail });
    const email = `down-${randomUUID().slice(0, 8)}@example.com`;
    const response = await loggingApp.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: unsafeRequestHeaders,
      payload: {
        name: 'Anita Nair',
        businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
        email,
        mobile: '+91 98470 12345',
        password: TEST_PASSWORD,
        industry: 'hotel_resort',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(text()).toContain('could not send the verification email');
    expect(text()).not.toContain(email);
    await loggingApp.close();
  });

  it('escapes the person name in the HTML, so a name cannot add markup to the email', async () => {
    const email = `html-${randomUUID().slice(0, 8)}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: unsafeRequestHeaders,
      payload: {
        name: '<script>alert(1)</script>',
        businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
        email,
        mobile: '+91 98470 12345',
        password: TEST_PASSWORD,
        industry: 'hotel_resort',
      },
    });
    const html = mail.sent.find((sent) => sent.to === email)!.html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  it('marks the email verified, writes the activity log, and the person can then use the app', async () => {
    const { email, userId, token } = await signUpAndGetToken();
    const response = await verifyEmail(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const user = await database.system
      .selectFrom('users')
      .select(['email_verified_at', 'account_id'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(user.email_verified_at).not.toBeNull();
    const kinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', user.account_id)
      .orderBy('created_at')
      .execute();
    expect(kinds.map((line) => line.kind)).toContain('auth.email_verified');

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: unsafeRequestHeaders,
      payload: { email, password: TEST_PASSWORD },
    });
    expect(login.json().user.emailVerified).toBe(true);
  });

  it('works once: the same link a second time is refused', async () => {
    const { token } = await signUpAndGetToken();
    expect((await verifyEmail(token)).statusCode).toBe(200);
    const again = await verifyEmail(token);
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('INVALID_TOKEN');
  });

  it('cannot be used twice by two requests at the same moment: exactly one wins', async () => {
    const { token } = await signUpAndGetToken();
    const results = await Promise.all([verifyEmail(token), verifyEmail(token), verifyEmail(token)]);
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 400)).toHaveLength(2);
  });

  it('refuses an expired link, and gives the same answer as for an unknown one', async () => {
    const { userId, token } = await signUpAndGetToken();
    await database.system
      .updateTable('auth_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('user_id', '=', userId)
      .execute();
    const expired = await verifyEmail(token);
    const unknown = await verifyEmail('x'.repeat(43));
    expect(expired.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(expired.json()).toEqual(unknown.json());
    const user = await database.system
      .selectFrom('users')
      .select('email_verified_at')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(user.email_verified_at).toBeNull();
  });

  it('refuses a link of another kind (a password-reset link cannot verify an email)', async () => {
    const { userId } = await signUpAndGetToken();
    const resetToken = randomUUID() + randomUUID();
    await database.system
      .insertInto('auth_tokens')
      .values({
        id: randomUUID(),
        user_id: userId,
        purpose: 'reset_password',
        token_hash: hashSecret(resetToken),
        expires_at: new Date(Date.now() + 3_600_000),
        used_at: null,
      })
      .execute();
    expect((await verifyEmail(resetToken)).statusCode).toBe(400);
  });

  it('checks the body: a missing, short or non-text token is a 400', async () => {
    for (const token of [undefined, 'short', 12345, 'x'.repeat(300)]) {
      expect((await verifyEmail(token)).statusCode, String(token)).toBe(400);
    }
  });

  it('needs no sign-in, but does need our Origin and X-Requested-With headers (CSRF)', async () => {
    const { token } = await signUpAndGetToken();
    const rejected = await verifyEmail(token, {});
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe('CSRF_REJECTED');
    expect((await verifyEmail(token)).statusCode).toBe(200); // the rejected try did not use up the link
  });

  it('never puts the token in the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger, mailSender: mail });
    const { token } = await signUpAndGetToken();
    await loggingApp.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      headers: unsafeRequestHeaders,
      payload: { token },
    });
    expect(text()).toContain('/api/v1/auth/verify-email'); // the logger was really recording
    expect(text()).not.toContain(token);
    await loggingApp.close();
  });
});

describe('POST /api/v1/auth/resend-email', () => {
  it('sends a new link to the signed-in person, and the old link stops working', async () => {
    const person = await createSignedInPerson(app, database, { verified: false });
    const firstToken = mail.latestTokenFor(person.email)!;
    expect((await resendEmail(person)).statusCode).toBe(200);
    const secondToken = mail.latestTokenFor(person.email)!;
    expect(secondToken).not.toBe(firstToken);
    expect(mail.sent.filter((sent) => sent.to === person.email)).toHaveLength(2);

    expect((await verifyEmail(firstToken)).statusCode).toBe(400); // replaced
    expect((await verifyEmail(secondToken)).statusCode).toBe(200);
    expect((await getMe(person)).json().user.emailVerified).toBe(true);
  });

  it('only ever emails the signed-in person own address', async () => {
    const first = await createSignedInPerson(app, database, { verified: false });
    const second = await createSignedInPerson(app, database, { verified: false });
    const before = mail.sent.length;
    await resendEmail(first);
    const newMessages = mail.sent.slice(before);
    expect(newMessages.map((message) => message.to)).toEqual([first.email]);
    expect(newMessages.some((message) => message.to === second.email)).toBe(false);
  });

  it('answers 409 ALREADY_VERIFIED for someone who is verified, and sends nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const before = mail.sent.length;
    const response = await resendEmail(person);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ALREADY_VERIFIED');
    expect(mail.sent.length).toBe(before);
  });

  it('answers 401 with no sign-in, and 403 without our CSRF headers', async () => {
    expect((await resendEmail(null)).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database, { verified: false });
    const rejected = await resendEmail(person, {});
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe('CSRF_REJECTED');
  });

  it('answers 502 EMAIL_NOT_SENT when the mail server is down, without leaking why', async () => {
    const failingMail = createRecordingMailSender();
    const failingApp = await buildTestApp(database, [], { mailSender: failingMail });
    const person = await createSignedInPerson(failingApp, database, { verified: false });
    failingMail.failNextSends(true);
    const response = await failingApp.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-email',
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('EMAIL_NOT_SENT');
    expect(response.body).not.toMatch(/mail server is down/);
    await failingApp.close();
  });
});

describe('a person whose email is not verified yet', () => {
  it('can see their profile (which says so), sign out and resend, but nothing else', async () => {
    const person = await createSignedInPerson(app, database, { verified: false });
    const me = await getMe(person);
    expect(me.statusCode).toBe(200);
    expect(me.json().user.emailVerified).toBe(false);
    expect((await resendEmail(person)).statusCode).toBe(200);
  });

  it('is refused 403 EMAIL_NOT_VERIFIED on a route that is not marked allowUnverified, until verified', async () => {
    const owner = await createSignedInPerson(app, database, { verified: false, isPlatformAdmin: true });
    const industryId = `kind_${randomUUID().slice(0, 6).replaceAll('-', '')}`;
    const addIndustry = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/industries',
        headers: { ...unsafeRequestHeaders, cookie: owner.cookieHeader },
        payload: { id: industryId, label: 'Test kind' },
      });
    const refused = await addIndustry();
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('EMAIL_NOT_VERIFIED');

    await verifyEmail(mail.latestTokenFor(owner.email)!);
    expect((await addIndustry()).statusCode).toBe(201);
    // Leave the shared industries list as we found it (another test checks it exactly)
    await database.system.deleteFrom('industries').where('id', '=', industryId).execute();
  });

  it('can sign out', async () => {
    const person = await createSignedInPerson(app, database, { verified: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('the database rules', () => {
  it('the app role cannot read auth_tokens or write email_verified_at (only the owner connection can)', async () => {
    const privilege = await database.pool.query<{ readable: boolean; writable: boolean; insertable: boolean }>(`
      select has_table_privilege('app_user', 'app.auth_tokens', 'SELECT') as readable,
             has_column_privilege('app_user', 'app.users', 'email_verified_at', 'UPDATE') as writable,
             has_column_privilege('app_user', 'app.users', 'email_verified_at', 'INSERT') as insertable`);
    expect(privilege.rows[0]).toEqual({ readable: false, writable: false, insertable: false });
  });
});
