import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { TEST_PASSWORD } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';

// Journey tests: whole stories a real person goes through, one route after another, in one pretend browser that keeps
// cookies like a real one. The other auth tests check one route at a time; these check that the routes work TOGETHER.

let database: Database;
let app: FastifyInstance;
let mail: RecordingMailSender;

const NEW_PASSWORD = 'planet-orange-bridge-77';
const THIRD_PASSWORD = 'violet-anchor-meadow-58';

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  app = await buildTestApp(database, [], { mailSender: mail });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** A new owner signs up through the real route; returns their email and a browser (not signed in yet). */
async function signUp(): Promise<{ email: string; browser: PretendBrowser }> {
  const email = `journey-${randomUUID().slice(0, 8)}@example.com`;
  const browser = createPretendBrowser(app);
  const response = await browser.send('POST', '/api/v1/auth/signup', {
    name: 'Anita Nair',
    businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
    email,
    mobile: '+91 98470 12345',
    password: TEST_PASSWORD,
    industry: 'hotel_resort',
  });
  expect(response.statusCode, response.body).toBe(201);
  return { email, browser };
}

const signIn = (browser: PretendBrowser, email: string, password: string) =>
  browser.send('POST', '/api/v1/auth/login', { email, password });

/** Opens the verification link from the newest email, the way the verify page would. */
async function verifyFromEmail(browser: PretendBrowser, email: string) {
  const response = await browser.send('POST', '/api/v1/auth/verify-email', { token: mail.latestTokenFor(email) });
  expect(response.statusCode, response.body).toBe(200);
}

describe('journey: a new owner from sign-up to signed out', () => {
  it('sign up → sign in (unverified) → blocked from changes → verify by email → change details → refresh → sign out → sign in again', async () => {
    const { email, browser } = await signUp();

    // Signed in but not verified: can see who they are, cannot change things
    expect((await signIn(browser, email, TEST_PASSWORD)).statusCode).toBe(200);
    expect(browser.cookieNames().sort()).toEqual(['toobler_access', 'toobler_refresh']);
    const unverifiedMe = await browser.send('GET', '/api/v1/me');
    expect(unverifiedMe.json().user.emailVerified).toBe(false);
    const blocked = await browser.send('PATCH', '/api/v1/me', { name: 'Meera Menon' });
    expect(blocked.json().error.code).toBe('EMAIL_NOT_VERIFIED');

    // Opens the link from the email: the same session now passes the verified-only rule
    await verifyFromEmail(browser, email);
    const verifiedMe = await browser.send('GET', '/api/v1/me');
    expect(verifiedMe.json().user.emailVerified).toBe(true);
    const changed = await browser.send('PATCH', '/api/v1/me', { name: 'Meera Menon', mobile: '098 765 43210' });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().user).toMatchObject({ name: 'Meera Menon', mobile: '+919876543210' });

    // The access token runs out; the browser trades its refresh cookie for new ones, and stays signed in
    const refreshed = await browser.send('POST', '/api/v1/auth/refresh');
    expect(refreshed.statusCode).toBe(200);
    expect((await browser.send('GET', '/api/v1/me')).json().user.name).toBe('Meera Menon');

    // Signs out: both cookies are gone and nothing works any more
    expect((await browser.send('POST', '/api/v1/auth/logout')).statusCode).toBe(200);
    expect(browser.cookieNames()).toEqual([]);
    expect((await browser.send('GET', '/api/v1/me')).statusCode).toBe(401);
    expect((await browser.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(401);

    // Comes back later and sees the saved changes
    expect((await signIn(browser, email, TEST_PASSWORD)).statusCode).toBe(200);
    expect((await browser.send('GET', '/api/v1/me')).json().user).toMatchObject({
      name: 'Meera Menon',
      mobile: '+919876543210',
      emailVerified: true,
    });
  });

  it('sign up → lost the first email → ask for another: the old link dies, the new one works', async () => {
    const { email, browser } = await signUp();
    const firstToken = mail.latestTokenFor(email)!;
    await signIn(browser, email, TEST_PASSWORD);
    expect((await browser.send('POST', '/api/v1/auth/resend-email')).statusCode).toBe(200);
    const secondToken = mail.latestTokenFor(email)!;
    expect(secondToken).not.toBe(firstToken);

    expect((await browser.send('POST', '/api/v1/auth/verify-email', { token: firstToken })).statusCode).toBe(400);
    expect((await browser.send('POST', '/api/v1/auth/verify-email', { token: secondToken })).statusCode).toBe(200);
    expect((await browser.send('POST', '/api/v1/auth/resend-email')).json().error.code).toBe('ALREADY_VERIFIED');
  });
});

describe('journey: forgot password', () => {
  it('signed in on two devices → forgot password → reset by email → every device is signed out → new password works → old does not', async () => {
    const { email, browser: laptop } = await signUp();
    await signIn(laptop, email, TEST_PASSWORD);
    await verifyFromEmail(laptop, email);
    const phone = createPretendBrowser(app);
    await signIn(phone, email, TEST_PASSWORD);
    expect((await phone.send('GET', '/api/v1/me')).statusCode).toBe(200);

    // Forgot it. Nobody is signed in on the reset page (a fresh browser), as in real life
    const resetPage = createPretendBrowser(app);
    expect((await resetPage.send('POST', '/api/v1/auth/forgot-password', { email })).statusCode).toBe(200);
    const token = mail.latestTokenFor(email)!;
    const reset = await resetPage.send('POST', '/api/v1/auth/reset-password', { token, newPassword: NEW_PASSWORD });
    expect(reset.statusCode).toBe(200);
    expect(resetPage.cookieNames()).toEqual([]); // a reset does not sign anyone in

    // Both devices are out, and neither can refresh their way back in
    for (const device of [laptop, phone]) {
      expect((await device.send('GET', '/api/v1/me')).statusCode).toBe(401);
      expect((await device.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(401);
    }

    // Old password refused, new one works, and the link cannot be used twice
    expect((await signIn(resetPage, email, TEST_PASSWORD)).statusCode).toBe(401);
    expect((await signIn(resetPage, email, NEW_PASSWORD)).statusCode).toBe(200);
    expect(
      (await resetPage.send('POST', '/api/v1/auth/reset-password', { token, newPassword: THIRD_PASSWORD })).statusCode,
    ).toBe(400);
    expect((await resetPage.send('GET', '/api/v1/me')).statusCode).toBe(200);
  });

  it('locked out after 5 wrong passwords → forgot password → reset → can sign in straight away', async () => {
    const { email, browser } = await signUp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn(browser, email, `wrong-password-${attempt}`)).statusCode).toBe(401);
    }
    expect((await signIn(browser, email, TEST_PASSWORD)).json().error.code).toBe('TOO_MANY_ATTEMPTS');

    await browser.send('POST', '/api/v1/auth/forgot-password', { email });
    const token = mail.latestTokenFor(email)!;
    expect(
      (await browser.send('POST', '/api/v1/auth/reset-password', { token, newPassword: NEW_PASSWORD })).statusCode,
    ).toBe(200);
    expect((await signIn(browser, email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('never verified the email → forgot password → reset: the emailed link also verifies them, so they can make changes', async () => {
    const { email, browser } = await signUp();
    await browser.send('POST', '/api/v1/auth/forgot-password', { email });
    await browser.send('POST', '/api/v1/auth/reset-password', {
      token: mail.latestTokenFor(email),
      newPassword: NEW_PASSWORD,
    });
    await signIn(browser, email, NEW_PASSWORD);
    expect((await browser.send('GET', '/api/v1/me')).json().user.emailVerified).toBe(true);
    expect((await browser.send('PATCH', '/api/v1/me', { name: 'Meera Menon' })).statusCode).toBe(200);
  });

  it('asks twice → only the newest email works; a reset link is not a verification link and the other way round', async () => {
    const { email, browser } = await signUp();
    const verificationToken = mail.latestTokenFor(email)!;
    await browser.send('POST', '/api/v1/auth/forgot-password', { email });
    const firstReset = mail.latestTokenFor(email)!;
    await browser.send('POST', '/api/v1/auth/forgot-password', { email });
    const secondReset = mail.latestTokenFor(email)!;

    expect((await browser.send('POST', '/api/v1/auth/verify-email', { token: firstReset })).statusCode).toBe(400);
    expect(
      (
        await browser.send('POST', '/api/v1/auth/reset-password', {
          token: verificationToken,
          newPassword: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await browser.send('POST', '/api/v1/auth/reset-password', { token: firstReset, newPassword: NEW_PASSWORD }))
        .statusCode,
    ).toBe(400);
    expect(
      (await browser.send('POST', '/api/v1/auth/reset-password', { token: secondReset, newPassword: NEW_PASSWORD }))
        .statusCode,
    ).toBe(200);
  });
});

describe('journey: changing the password while signed in', () => {
  it('two devices → change on one → the other is signed out (and cannot refresh) → this one carries on → new password signs in', async () => {
    const { email, browser: laptop } = await signUp();
    await signIn(laptop, email, TEST_PASSWORD);
    await verifyFromEmail(laptop, email);
    const phone = createPretendBrowser(app);
    await signIn(phone, email, TEST_PASSWORD);

    const changed = await laptop.send('POST', '/api/v1/me/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(changed.statusCode).toBe(200);

    expect((await phone.send('GET', '/api/v1/me')).statusCode).toBe(401);
    expect((await phone.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(401);
    expect((await laptop.send('GET', '/api/v1/me')).statusCode).toBe(200);
    expect((await laptop.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(200); // the changing device keeps its refresh

    const freshBrowser = createPretendBrowser(app);
    expect((await signIn(freshBrowser, email, TEST_PASSWORD)).statusCode).toBe(401);
    expect((await signIn(freshBrowser, email, NEW_PASSWORD)).statusCode).toBe(200);

    // And it can be changed again, from the new password
    const again = await freshBrowser.send('POST', '/api/v1/me/password', {
      currentPassword: NEW_PASSWORD,
      newPassword: THIRD_PASSWORD,
    });
    expect(again.statusCode).toBe(200);
  });
});

describe('journey: a stolen refresh token', () => {
  it('owner refreshes → thief replays the copied old token later → the whole session ends, for the thief and the owner', async () => {
    const { email, browser: owner } = await signUp();
    await signIn(owner, email, TEST_PASSWORD);
    await verifyFromEmail(owner, email);

    // The thief copies the owner's refresh cookie
    const thief = createPretendBrowser(app);
    thief.setCookie('toobler_refresh', owner.cookieValue('toobler_refresh')!);

    // The owner refreshes normally; the copied token is now the "just replaced" one. A minute later it is not a race any more
    expect((await owner.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(200);
    await database.system
      .updateTable('sessions')
      .set({ rotated_at: new Date(Date.now() - 5 * 60_000) })
      .where('user_id', '=', database.system.selectFrom('users').select('id').where('email', '=', email))
      .execute();
    expect((await owner.send('GET', '/api/v1/me')).statusCode).toBe(200);

    // The replay fails, and everything the owner held goes with it
    const replay = await thief.send('POST', '/api/v1/auth/refresh');
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('SESSION_ENDED');
    expect((await owner.send('GET', '/api/v1/me')).statusCode).toBe(401);
    expect((await owner.send('POST', '/api/v1/auth/refresh')).statusCode).toBe(401);

    // The owner signs in again with their password and is fine; the thief gets nothing from it
    expect((await signIn(owner, email, TEST_PASSWORD)).statusCode).toBe(200);
    expect((await owner.send('GET', '/api/v1/me')).statusCode).toBe(200);
    expect((await thief.send('GET', '/api/v1/me')).statusCode).toBe(401);
  });
});
