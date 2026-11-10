import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { hashSecret, signAccessToken } from '../src/modules/core/auth/tokens';
import type { Database } from '../src/kernel/db';
import { buildTestApp, captureLogs, testConfig } from './support/app';
import { createMemoryMail, TestBrowser, uniqueEmail, validSignUp } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
const mail = createMemoryMail();

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], { mail: mail.provider });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Signs a new owner up in a fresh browser and returns what the tests need. */
async function signUp(overrides: Record<string, unknown> = {}) {
  const browser = new TestBrowser(app);
  const body = validSignUp(overrides);
  const response = await browser.post('/api/v1/auth/signup', body);
  expect(response.statusCode, response.body).toBe(201);
  return { browser, body, profile: response.json(), response };
}

/** Signs up and clicks the email link, so the person is verified. */
async function signUpVerified(overrides: Record<string, unknown> = {}) {
  const person = await signUp(overrides);
  const verification = await new TestBrowser(app).post('/api/v1/auth/verify-email', {
    token: mail.latestToken(person.body.email),
  });
  expect(verification.statusCode).toBe(200);
  return person;
}

/** A second browser signed in as the same person. */
async function signInAgain(email: string, password = 'river-lamp-kettle-42') {
  const browser = new TestBrowser(app);
  const response = await browser.post('/api/v1/auth/login', { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return browser;
}

const sessionRows = (email: string) =>
  database.system
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['sessions.id', 'sessions.revoked_at', 'sessions.refresh_token_hash'])
    .where('users.email', '=', email)
    .execute();

describe('sign up', () => {
  it('creates the business and its owner, signs them in, and emails a verification link', async () => {
    const { browser, body, profile, response } = await signUp();

    expect(profile).toMatchObject({
      user: { name: 'Anita Nair', email: body.email, mobile: '+919847012345', role: 'manager', emailVerified: false },
      business: { name: body.businessName, industry: 'hotel_resort', timeZone: 'Asia/Kolkata' },
    });
    expect(JSON.stringify(profile)).not.toMatch(/password|hash/i);

    // Two httpOnly SameSite=Lax cookies; the refresh one only goes to the refresh address
    const access = response.cookies.find((cookie) => cookie.name === 'toobler_access');
    const refresh = response.cookies.find((cookie) => cookie.name === 'toobler_refresh');
    expect(access).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api', maxAge: 15 * 60 });
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1/auth/refresh' });

    // Stored safely: an argon2id hash, a refresh token that is only a hash, an owner row in the right business
    const credentials = await database.system
      .selectFrom('user_credentials')
      .innerJoin('users', 'users.id', 'user_credentials.user_id')
      .select(['user_credentials.password_hash', 'users.role', 'users.mobile_key', 'users.account_id'])
      .where('users.email', '=', body.email)
      .executeTakeFirstOrThrow();
    expect(credentials.password_hash).toMatch(/^\$argon2id\$/);
    expect(credentials.password_hash).not.toContain(body.password);
    expect(credentials).toMatchObject({ role: 'manager', mobile_key: '9847012345', account_id: profile.business.id });
    const [session] = await sessionRows(body.email);
    expect(session?.refresh_token_hash).toBe(hashSecret(refresh!.value));

    expect(mail.sentTo(body.email)).toHaveLength(1);
    expect(mail.sentTo(body.email)[0]?.text).toContain('/verify-email?token=');
    const logLines = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', profile.business.id)
      .execute();
    expect(logLines.map((line) => line.kind)).toEqual(['auth.signed_up']);

    // They are signed in, but the server keeps them out of everything except the verify steps until the email is verified
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
    const refused = await browser.patch('/api/v1/me', { name: 'New Name' });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(
      (await browser.post('/api/v1/me/password', { currentPassword: 'x', newPassword: 'y'.repeat(12) })).json().error
        .code,
    ).toBe('EMAIL_NOT_VERIFIED');
  });

  it('refuses bad input with a clear message for each problem', async () => {
    const browser = new TestBrowser(app);
    const attempts: [Record<string, unknown>, number, string][] = [
      [{ email: 'not-an-email' }, 400, 'VALIDATION_ERROR'],
      [{ password: 'short' }, 400, 'VALIDATION_ERROR'],
      [{ businessName: '' }, 400, 'VALIDATION_ERROR'],
      [{ industry: 'spaceships' }, 400, 'VALIDATION_ERROR'],
      [{ mobile: 'abcdefgh1' }, 400, 'INVALID_MOBILE'],
      [{ password: 'Password123' }, 400, 'WEAK_PASSWORD'],
      [{ password: 'aaaaaaaaaaaa' }, 400, 'WEAK_PASSWORD'],
    ];
    for (const [overrides, status, code] of attempts) {
      const response = await browser.post('/api/v1/auth/signup', validSignUp(overrides));
      expect(response.statusCode, JSON.stringify(overrides)).toBe(status);
      expect(response.json().error.code, JSON.stringify(overrides)).toBe(code);
    }
    expect((await browser.post('/api/v1/auth/signup', {})).statusCode).toBe(400);
  });

  it('lets one email manage one business: a second sign-up with it is refused, whatever the letter case', async () => {
    const first = await signUp();
    const again = await new TestBrowser(app).post(
      '/api/v1/auth/signup',
      validSignUp({ email: first.body.email.toUpperCase() }),
    );
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('EMAIL_TAKEN');
    const businesses = await database.system
      .selectFrom('users')
      .select('id')
      .where('email', '=', first.body.email)
      .execute();
    expect(businesses).toHaveLength(1);
  });

  it('creates exactly one account when two sign-ups with the same email arrive together', async () => {
    const email = uniqueEmail();
    const results = await Promise.all([
      new TestBrowser(app).post('/api/v1/auth/signup', validSignUp({ email })),
      new TestBrowser(app).post('/api/v1/auth/signup', validSignUp({ email })),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  });
});

describe('email verification', () => {
  it('works once, then the app is open to the person', async () => {
    const { browser, body } = await signUp();
    const token = mail.latestToken(body.email);
    const verify = await new TestBrowser(app).post('/api/v1/auth/verify-email', { token });
    expect(verify.json()).toEqual({ ok: true });
    expect((await browser.get('/api/v1/me')).json().user.emailVerified).toBe(true);
    expect((await browser.patch('/api/v1/me', { name: 'Anita N' })).statusCode).toBe(200);
    const reused = await new TestBrowser(app).post('/api/v1/auth/verify-email', { token });
    expect(reused.statusCode).toBe(400);
    expect(reused.json().error.code).toBe('INVALID_LINK');
  });

  it('refuses a made-up link, a short one and an expired one', async () => {
    const { body } = await signUp();
    const browser = new TestBrowser(app);
    expect((await browser.post('/api/v1/auth/verify-email', { token: 'x'.repeat(43) })).json().error.code).toBe(
      'INVALID_LINK',
    );
    expect((await browser.post('/api/v1/auth/verify-email', { token: 'short' })).json().error.code).toBe(
      'VALIDATION_ERROR',
    );
    await database.system
      .updateTable('auth_tokens')
      .set({ expires_at: sql`now() - interval '1 minute'` })
      .where('secret_hash', '=', hashSecret(mail.latestToken(body.email)))
      .execute();
    expect(
      (await browser.post('/api/v1/auth/verify-email', { token: mail.latestToken(body.email) })).json().error.code,
    ).toBe('INVALID_LINK');
  });

  it('sends a new link on request, and only the newest link works', async () => {
    const { browser, body } = await signUp();
    const oldToken = mail.latestToken(body.email);
    expect((await browser.post('/api/v1/auth/resend-email')).json()).toEqual({ ok: true });
    expect(mail.sentTo(body.email)).toHaveLength(2);
    const newToken = mail.latestToken(body.email);
    expect(newToken).not.toBe(oldToken);
    const anonymous = new TestBrowser(app);
    expect((await anonymous.post('/api/v1/auth/verify-email', { token: oldToken })).statusCode).toBe(400);
    expect((await anonymous.post('/api/v1/auth/verify-email', { token: newToken })).statusCode).toBe(200);
    // Once verified, asking again sends nothing more
    await browser.post('/api/v1/auth/resend-email');
    expect(mail.sentTo(body.email)).toHaveLength(2);
  });
});

describe('sign in', () => {
  it('signs a verified person in with two cookies and records it', async () => {
    const { body, profile } = await signUpVerified();
    const browser = new TestBrowser(app);
    const response = await browser.post('/api/v1/auth/login', {
      email: body.email.toUpperCase(),
      password: body.password,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().business.id).toBe(profile.business.id);
    expect([...browser.cookies.keys()].sort()).toEqual(['toobler_access', 'toobler_refresh']);
    const kinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', profile.business.id)
      .execute();
    expect(kinds.map((line) => line.kind)).toContain('auth.signed_in');
    const sessions = await sessionRows(body.email);
    expect(sessions).toHaveLength(2); // the sign-up one and this one
  });

  it('answers a wrong password and an unknown email exactly the same', async () => {
    const { body } = await signUpVerified();
    const browser = new TestBrowser(app);
    const wrongPassword = await browser.post('/api/v1/auth/login', {
      email: body.email,
      password: 'not-the-password-1',
    });
    const unknownEmail = await browser.post('/api/v1/auth/login', {
      email: uniqueEmail(),
      password: 'not-the-password-1',
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error).toEqual(unknownEmail.json().error);
    expect(wrongPassword.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks an email for 15 minutes after 5 wrong passwords, even for the right one, and the same for unknown emails', async () => {
    const { body } = await signUpVerified();
    const browser = new TestBrowser(app);
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(
        (await browser.post('/api/v1/auth/login', { email: body.email, password: 'wrong-password-1' })).statusCode,
      ).toBe(401);
    }
    const locked = await browser.post('/api/v1/auth/login', { email: body.email, password: body.password });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toMatchObject({ code: 'LOGIN_LOCKED' });
    expect(locked.json().error.message).toContain('15 minutes');

    const ghost = uniqueEmail();
    for (let attempt = 1; attempt <= 5; attempt++)
      await browser.post('/api/v1/auth/login', { email: ghost, password: 'wrong-password-1' });
    const ghostLocked = await browser.post('/api/v1/auth/login', { email: ghost, password: 'wrong-password-1' });
    expect(ghostLocked.statusCode).toBe(429);
    expect(ghostLocked.json().error).toEqual(locked.json().error);

    // After the lock runs out the right password works again, and the counter is cleared
    await database.system
      .updateTable('login_attempts')
      .set({ locked_until: sql`now() - interval '1 second'` })
      .where('key_hash', '=', hashSecret(`login:${body.email}`))
      .execute();
    expect((await browser.post('/api/v1/auth/login', { email: body.email, password: body.password })).statusCode).toBe(
      200,
    );
    const leftOver = await database.system
      .selectFrom('login_attempts')
      .select('key_hash')
      .where('key_hash', '=', hashSecret(`login:${body.email}`))
      .execute();
    expect(leftOver).toEqual([]);
  });

  it('does not count wrong passwords that are older than the lock window', async () => {
    const { body } = await signUpVerified();
    const browser = new TestBrowser(app);
    for (let attempt = 1; attempt <= 4; attempt++)
      await browser.post('/api/v1/auth/login', { email: body.email, password: 'wrong-password-1' });
    await database.system
      .updateTable('login_attempts')
      .set({ updated_at: sql`now() - interval '20 minutes'` })
      .where('key_hash', '=', hashSecret(`login:${body.email}`))
      .execute();
    expect(
      (await browser.post('/api/v1/auth/login', { email: body.email, password: 'wrong-password-1' })).statusCode,
    ).toBe(401); // restarts at 1, no lock
    expect((await browser.post('/api/v1/auth/login', { email: body.email, password: body.password })).statusCode).toBe(
      200,
    );
  });

  it('refuses a disabled person', async () => {
    const { body } = await signUpVerified();
    await database.system.updateTable('users').set({ status: 'disabled' }).where('email', '=', body.email).execute();
    expect(
      (await new TestBrowser(app).post('/api/v1/auth/login', { email: body.email, password: body.password })).json()
        .error.code,
    ).toBe('INVALID_CREDENTIALS');
  });
});

describe('the access token and every request', () => {
  it('answers 401 without a session on every signed-in route', async () => {
    const browser = new TestBrowser(app);
    const results = await Promise.all([
      browser.get('/api/v1/me'),
      browser.patch('/api/v1/me', { name: 'X' }),
      browser.post('/api/v1/me/password', { currentPassword: 'a', newPassword: 'b'.repeat(12) }),
      browser.post('/api/v1/auth/logout'),
      browser.post('/api/v1/auth/resend-email'),
    ]);
    for (const response of results) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    }
  });

  it('refuses a forged, edited or foreign token', async () => {
    const { browser, profile } = await signUpVerified();
    const real = browser.cookies.get('toobler_access')!.value;
    for (const forged of ['garbage', `${real}x`, real.split('.').slice(0, 2).join('.') + '.', 'a.b.c']) {
      const forgedBrowser = new TestBrowser(app);
      forgedBrowser.setCookie('toobler_access', forged, '/api');
      expect((await forgedBrowser.get('/api/v1/me')).statusCode, forged).toBe(401);
    }
    const wrongSecret = await signAccessToken(
      { userId: profile.user.id, sessionId: profile.user.id },
      { secret: 'x'.repeat(40), minutes: 15 },
    );
    const attacker = new TestBrowser(app);
    attacker.setCookie('toobler_access', wrongSecret, '/api');
    expect((await attacker.get('/api/v1/me')).statusCode).toBe(401);
  });

  it('answers TOKEN_EXPIRED for an expired token, and the person is back in after a refresh', async () => {
    const { browser, profile } = await signUpVerified();
    const [session] = await sessionRows(profile.user.email);
    const expiredToken = await signAccessToken(
      { userId: profile.user.id, sessionId: session!.id },
      { secret: testConfig().auth.jwtSecret, minutes: 15 },
      new Date(Date.now() - 60 * 60_000),
    );
    browser.setCookie('toobler_access', expiredToken, '/api');
    const expired = await browser.get('/api/v1/me');
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe('TOKEN_EXPIRED');
    expect((await browser.post('/api/v1/auth/refresh')).statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
  });

  it('stops a valid token the moment its session is ended (not 15 minutes later)', async () => {
    const { browser, profile } = await signUpVerified();
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
    await database.system
      .updateTable('sessions')
      .set({ revoked_at: sql`now()` })
      .where('user_id', '=', profile.user.id)
      .execute();
    const response = await browser.get('/api/v1/me');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_ENDED');
  });

  it('stops a person who has been disabled at once', async () => {
    const { browser, profile } = await signUpVerified();
    await database.system.updateTable('users').set({ status: 'disabled' }).where('id', '=', profile.user.id).execute();
    expect((await browser.get('/api/v1/me')).statusCode).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('are replaced at every refresh, and only the newest is kept as current', async () => {
    const { browser, profile } = await signUpVerified();
    const before = browser.cookies.get('toobler_refresh')!.value;
    const response = await browser.post('/api/v1/auth/refresh');
    expect(response.statusCode).toBe(200);
    const after = browser.cookies.get('toobler_refresh')!.value;
    expect(after).not.toBe(before);
    const [session] = await sessionRows(profile.user.email);
    expect(session?.refresh_token_hash).toBe(hashSecret(after));
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
  });

  it('end the whole session when a replaced token is used again after the grace period (a stolen copy)', async () => {
    const { browser, profile } = await signUpVerified();
    const stolen = browser.cookies.get('toobler_refresh')!.value;
    await browser.post('/api/v1/auth/refresh'); // the real browser moves on
    await database.system
      .updateTable('sessions')
      .set({ rotated_at: sql`now() - interval '2 minutes'` })
      .where('user_id', '=', profile.user.id)
      .execute();

    const thief = new TestBrowser(app);
    thief.setCookie('toobler_refresh', stolen, '/api/v1/auth/refresh');
    const response = await thief.post('/api/v1/auth/refresh');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_ENDED');
    // The real browser is signed out too: its newer token no longer works
    expect((await browser.post('/api/v1/auth/refresh')).statusCode).toBe(401);
    expect((await browser.get('/api/v1/me')).statusCode).toBe(401);
  });

  it('accept a replaced token within a minute (two requests refreshing at once) and give it an access token only', async () => {
    const { browser } = await signUpVerified();
    const original = browser.cookies.get('toobler_refresh')!.value;
    await browser.post('/api/v1/auth/refresh');
    const second = new TestBrowser(app);
    second.setCookie('toobler_refresh', original, '/api/v1/auth/refresh');
    const response = await second.post('/api/v1/auth/refresh');
    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((cookie) => cookie.name === 'toobler_access')).toBe(true);
    expect(response.cookies.some((cookie) => cookie.name === 'toobler_refresh')).toBe(false);
  });

  it('let two simultaneous refreshes both succeed, and exactly one of them gets the new refresh token', async () => {
    const { browser } = await signUpVerified();
    const token = browser.cookies.get('toobler_refresh')!.value;
    const twins = [new TestBrowser(app), new TestBrowser(app)];
    for (const twin of twins) twin.setCookie('toobler_refresh', token, '/api/v1/auth/refresh');
    const responses = await Promise.all(twins.map((twin) => twin.post('/api/v1/auth/refresh')));
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(
      responses.filter((response) => response.cookies.some((cookie) => cookie.name === 'toobler_refresh')),
    ).toHaveLength(1);
  });

  it('stop working after 7 idle days, after 30 days in all, when the session is ended, and without a cookie', async () => {
    const idle = await signUpVerified();
    await database.system
      .updateTable('sessions')
      .set({ last_used_at: sql`now() - interval '8 days'` })
      .where('user_id', '=', idle.profile.user.id)
      .execute();
    expect((await idle.browser.post('/api/v1/auth/refresh')).statusCode).toBe(401);
    expect(idle.browser.cookies.size).toBe(0); // a failed refresh clears the cookies

    const old = await signUpVerified();
    await database.system
      .updateTable('sessions')
      .set({ expires_at: sql`now() - interval '1 second'` })
      .where('user_id', '=', old.profile.user.id)
      .execute();
    expect((await old.browser.post('/api/v1/auth/refresh')).statusCode).toBe(401);

    const ended = await signUpVerified();
    await database.system
      .updateTable('sessions')
      .set({ revoked_at: sql`now()` })
      .where('user_id', '=', ended.profile.user.id)
      .execute();
    expect((await ended.browser.post('/api/v1/auth/refresh')).statusCode).toBe(401);

    const response = await new TestBrowser(app).post('/api/v1/auth/refresh');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_ENDED');
  });
});

describe('sign out', () => {
  it('ends the session at once and clears the cookies', async () => {
    const { browser, body } = await signUpVerified();
    const staleCopy = new TestBrowser(app);
    for (const [name, cookie] of browser.cookies) staleCopy.setCookie(name, cookie.value, cookie.path);
    const response = await browser.post('/api/v1/auth/logout');
    expect(response.statusCode).toBe(200);
    expect(browser.cookies.size).toBe(0);
    expect((await staleCopy.get('/api/v1/me')).statusCode).toBe(401); // a copy of the old cookies is dead too
    expect((await sessionRows(body.email))[0]?.revoked_at).not.toBeNull();
  });
});

describe('forgot and reset password', () => {
  it('answers the same for an email with an account and one without, and emails only the first', async () => {
    const { body } = await signUpVerified();
    const stranger = uniqueEmail();
    const browser = new TestBrowser(app);
    const known = await browser.post('/api/v1/auth/forgot-password', { email: body.email });
    const unknown = await browser.post('/api/v1/auth/forgot-password', { email: stranger });
    expect(known.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(mail.sentTo(body.email).filter((message) => message.subject.includes('Reset'))).toHaveLength(1);
    expect(mail.sentTo(stranger)).toHaveLength(0);
  });

  it('sets a new password from the link once, ends every session, and the old password stops working', async () => {
    const { browser, body } = await signUpVerified();
    const otherDevice = await signInAgain(body.email);
    await new TestBrowser(app).post('/api/v1/auth/forgot-password', { email: body.email });
    const token = mail.latestToken(body.email);

    const weak = await new TestBrowser(app).post('/api/v1/auth/reset-password', { token, password: 'Password123' });
    expect(weak.json().error.code).toBe('WEAK_PASSWORD'); // a rejected password does not use up the link

    const reset = await new TestBrowser(app).post('/api/v1/auth/reset-password', {
      token,
      password: 'a-brand-new-password-7',
    });
    expect(reset.statusCode).toBe(200);
    expect(
      (
        await new TestBrowser(app).post('/api/v1/auth/reset-password', { token, password: 'another-password-123' })
      ).json().error.code,
    ).toBe('INVALID_LINK');
    expect((await browser.get('/api/v1/me')).statusCode).toBe(401);
    expect((await otherDevice.get('/api/v1/me')).statusCode).toBe(401);
    expect(
      (await new TestBrowser(app).post('/api/v1/auth/login', { email: body.email, password: body.password }))
        .statusCode,
    ).toBe(401);
    expect(
      (await new TestBrowser(app).post('/api/v1/auth/login', { email: body.email, password: 'a-brand-new-password-7' }))
        .statusCode,
    ).toBe(200);
  });

  it('refuses an expired link, and lets a reset also lift a lockout and verify the email', async () => {
    const { body } = await signUp(); // not verified yet
    for (let attempt = 1; attempt <= 5; attempt++)
      await new TestBrowser(app).post('/api/v1/auth/login', { email: body.email, password: 'wrong-password-1' });
    await new TestBrowser(app).post('/api/v1/auth/forgot-password', { email: body.email });
    const token = mail.latestToken(body.email);
    await database.system
      .updateTable('auth_tokens')
      .set({ expires_at: sql`now() - interval '1 minute'` })
      .where('secret_hash', '=', hashSecret(token))
      .execute();
    expect(
      (await new TestBrowser(app).post('/api/v1/auth/reset-password', { token, password: 'a-brand-new-password-7' }))
        .statusCode,
    ).toBe(400);

    await new TestBrowser(app).post('/api/v1/auth/forgot-password', { email: body.email });
    const freshToken = mail.latestToken(body.email);
    expect(
      (
        await new TestBrowser(app).post('/api/v1/auth/reset-password', {
          token: freshToken,
          password: 'a-brand-new-password-7',
        })
      ).statusCode,
    ).toBe(200);
    const login = await new TestBrowser(app).post('/api/v1/auth/login', {
      email: body.email,
      password: 'a-brand-new-password-7',
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.emailVerified).toBe(true);
  });
});

describe('change password', () => {
  it('needs the current password, keeps this session and ends the others', async () => {
    const { browser, body } = await signUpVerified();
    const otherDevice = await signInAgain(body.email);
    const wrong = await browser.post('/api/v1/me/password', {
      currentPassword: 'not-my-password',
      newPassword: 'a-brand-new-password-7',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('WRONG_PASSWORD');
    expect(
      (await browser.post('/api/v1/me/password', { currentPassword: body.password, newPassword: body.password }))
        .statusCode,
    ).toBe(400);
    expect(
      (await browser.post('/api/v1/me/password', { currentPassword: body.password, newPassword: 'Password123' })).json()
        .error.code,
    ).toBe('WEAK_PASSWORD');

    const changed = await browser.post('/api/v1/me/password', {
      currentPassword: body.password,
      newPassword: 'a-brand-new-password-7',
    });
    expect(changed.statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200); // this browser stays signed in
    expect((await otherDevice.get('/api/v1/me')).statusCode).toBe(401);
    expect(
      (await new TestBrowser(app).post('/api/v1/auth/login', { email: body.email, password: 'a-brand-new-password-7' }))
        .statusCode,
    ).toBe(200);
  });
});

describe('/me', () => {
  it('shows only the caller and their business, changes only the name, and records it', async () => {
    const firstPerson = await signUpVerified({ name: 'Anita A', businessName: 'Business A' });
    const secondPerson = await signUpVerified({ name: 'Bala B', businessName: 'Business B' });
    expect((await firstPerson.browser.get('/api/v1/me')).json()).toMatchObject({
      user: { name: 'Anita A' },
      business: { name: 'Business A' },
    });
    expect((await secondPerson.browser.get('/api/v1/me')).json()).toMatchObject({
      user: { name: 'Bala B' },
      business: { name: 'Business B' },
    });

    const renamed = await firstPerson.browser.patch('/api/v1/me', { name: 'Anita Nair' });
    expect(renamed.json().user.name).toBe('Anita Nair');
    expect((await secondPerson.browser.get('/api/v1/me')).json().user.name).toBe('Bala B');
    for (const bad of [{ name: '' }, { name: 'x'.repeat(101) }, {}, { role: 'manager' }]) {
      expect((await firstPerson.browser.patch('/api/v1/me', bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
    const kinds = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'fields'])
      .where('account_id', '=', firstPerson.profile.business.id)
      .execute();
    expect(kinds).toContainEqual({ kind: 'auth.name_changed', fields: ['name'] });
  });

  it('keeps each business apart: a fenced query sees only its own people and its own row', async () => {
    const firstPerson = await signUpVerified();
    const secondPerson = await signUpVerified();
    const visibleToA = await database.runInAccountTransaction(firstPerson.profile.business.id, async (transaction) => ({
      emails: (await transaction.selectFrom('users').select('email').execute()).map((row) => row.email),
      businesses: (await transaction.selectFrom('accounts').select('id').execute()).map((row) => row.id),
    }));
    expect(visibleToA.emails).toEqual([firstPerson.body.email]);
    expect(visibleToA.businesses).toEqual([firstPerson.profile.business.id]);
    expect(visibleToA.emails).not.toContain(secondPerson.body.email);
  });
});

describe('what the server never writes to its logs', () => {
  it('keeps passwords, tokens, cookies and email addresses out of the log', async () => {
    const { logger, text } = captureLogs();
    const loggingMail = createMemoryMail();
    const loggingApp = await buildTestApp(database, [], { logger, mail: loggingMail.provider });
    const browser = new TestBrowser(loggingApp);
    const body = validSignUp({ password: 'distinct-log-test-password-9' });
    await browser.post('/api/v1/auth/signup', body);
    await browser.post('/api/v1/auth/verify-email', { token: loggingMail.latestToken(body.email) });
    await browser.post('/api/v1/auth/login', { email: body.email, password: 'wrong-password-for-log-test' });
    await browser.post('/api/v1/auth/login', { email: body.email, password: body.password });
    await browser.post('/api/v1/auth/refresh');
    const secrets = [
      body.password,
      'wrong-password-for-log-test',
      body.email,
      '9847012345',
      loggingMail.latestToken(body.email),
      ...[...browser.cookies.values()].map((cookie) => cookie.value),
    ];
    const logged = text();
    expect(logged).toContain('/api/v1/auth/login'); // the logger was really recording
    for (const secret of secrets) expect(logged, `the log contains "${secret.slice(0, 12)}..."`).not.toContain(secret);
    await loggingApp.close();
  });
});

describe('limits on the open routes', () => {
  it('stop an address that tries sign-up and forgot-password too often', async () => {
    const strictApp = await buildTestApp(database, [], {
      config: testConfig({ AUTH_RATE_LIMIT_SCALE: '1' }),
      mail: mail.provider,
    });
    const browser = new TestBrowser(strictApp);
    const signUpStatuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt++)
      signUpStatuses.push((await browser.post('/api/v1/auth/signup', {})).statusCode);
    expect(signUpStatuses).toEqual([400, 400, 400, 400, 400, 429]);

    const forgotStatuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt++)
      forgotStatuses.push((await browser.post('/api/v1/auth/forgot-password', { email: uniqueEmail() })).statusCode);
    expect(forgotStatuses).toEqual([200, 200, 200, 200, 200, 429]);
    await strictApp.close();
  });

  it('refuse requests that do not come from our own web app (CSRF)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail(), password: 'whatever-123' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF_REJECTED');
  });
});
