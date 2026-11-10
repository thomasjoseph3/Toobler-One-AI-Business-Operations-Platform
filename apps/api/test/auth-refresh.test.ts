import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import * as sessionsRepository from '../src/modules/core/auth/repositories/sessions.repository';
import { hashSecret, signAccessToken } from '../src/modules/core/auth/helpers/tokens';
import { buildTestApp, captureLogs, testConfig, unsafeRequestHeaders } from './support/app';
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

/** POST /auth/refresh the way the browser does: the refresh cookie only, plus our CSRF headers. */
const refresh = (
  refreshToken: string | null,
  headers: Record<string, string> = unsafeRequestHeaders,
  testApp: FastifyInstance = app,
) =>
  testApp.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { ...headers, ...(refreshToken ? { cookie: `toobler_refresh=${refreshToken}` } : {}) },
  });

const cookieValue = (response: Awaited<ReturnType<typeof refresh>>, name: string) =>
  response.cookies.find((cookie) => cookie.name === name)?.value;

const getMe = (accessCookieHeader: string) =>
  app.inject({ url: '/api/v1/me', headers: { cookie: accessCookieHeader } });

/** The person's one session row. */
const sessionOf = (person: SignedInPerson) =>
  database.system
    .selectFrom('sessions')
    .selectAll()
    .where('user_id', '=', person.profile.user.id)
    .executeTakeFirstOrThrow();

/** Moves a time column of the person's session into the past, as if that long had gone by. */
async function ageSession(person: SignedInPerson, column: 'last_used_at' | 'rotated_at' | 'expires_at', ms: number) {
  await database.system
    .updateTable('sessions')
    .set({ [column]: new Date(Date.now() - ms) })
    .where('user_id', '=', person.profile.user.id)
    .execute();
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('POST /api/v1/auth/refresh', () => {
  it('gives a new access token and a NEW refresh token, and answers with the profile', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await refresh(person.refreshToken);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(person.profile);

    const newAccess = cookieValue(response, 'toobler_access')!;
    const newRefresh = cookieValue(response, 'toobler_refresh')!;
    expect(newAccess).toBeTruthy();
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(person.refreshToken);
    expect((await getMe(`toobler_access=${newAccess}`)).statusCode).toBe(200);
    // Tokens travel in cookies only, never in the body
    expect(response.body).not.toContain(newAccess);
    expect(response.body).not.toContain(newRefresh);
  });

  it('sets both cookies the way sign-in does: httpOnly, SameSite=Lax, on the right paths', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await refresh(person.refreshToken);
    const access = response.cookies.find((cookie) => cookie.name === 'toobler_access');
    const refreshCookie = response.cookies.find((cookie) => cookie.name === 'toobler_refresh');
    expect(access).toMatchObject({ path: '/api', httpOnly: true, sameSite: 'Lax' });
    expect(refreshCookie).toMatchObject({ path: '/api/v1/auth/refresh', httpOnly: true, sameSite: 'Lax' });
  });

  it('stores only hashes: the new token as current, the old one as "just replaced"', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await refresh(person.refreshToken);
    const newRefresh = cookieValue(response, 'toobler_refresh')!;
    const session = await sessionOf(person);
    expect(session.refresh_token_hash).toBe(hashSecret(newRefresh));
    expect(session.previous_refresh_token_hash).toBe(hashSecret(person.refreshToken));
    expect(session.rotated_at).not.toBeNull();
    expect(JSON.stringify(session)).not.toContain(newRefresh);
  });

  it('can be repeated: each new token works once, in a chain', async () => {
    const person = await createSignedInPerson(app, database);
    let token = person.refreshToken;
    for (let round = 0; round < 3; round += 1) {
      const response = await refresh(token);
      expect(response.statusCode, `round ${round}`).toBe(200);
      token = cookieValue(response, 'toobler_refresh')!;
    }
  });

  it('brings a person back after their access token has run out', async () => {
    const person = await createSignedInPerson(app, database);
    const expiredAccess = await signAccessToken(
      { userId: person.profile.user.id, sessionId: (await sessionOf(person)).id },
      { secret: testConfig().auth.jwtSecret, minutes: 15 },
      new Date(Date.now() - 60 * MINUTE),
    );
    const refused = await getMe(`toobler_access=${expiredAccess}`);
    expect(refused.statusCode).toBe(401);
    expect(refused.json().error.code).toBe('TOKEN_EXPIRED');

    const response = await refresh(person.refreshToken);
    expect((await getMe(`toobler_access=${cookieValue(response, 'toobler_access')}`)).statusCode).toBe(200);
  });

  it('lets a person with an unverified email refresh (they are still signed in)', async () => {
    const person = await createSignedInPerson(app, database, { verified: false });
    const response = await refresh(person.refreshToken);
    expect(response.statusCode).toBe(200);
    expect(response.json().user.emailVerified).toBe(false);
  });
});

describe('the replaced token', () => {
  it('used again moments later is a harmless race: a new access token, but no second refresh token, and the session lives', async () => {
    const person = await createSignedInPerson(app, database);
    const first = await refresh(person.refreshToken);
    const second = await refresh(person.refreshToken); // the other browser tab, a moment later
    expect(second.statusCode).toBe(200);
    expect(cookieValue(second, 'toobler_access')).toBeTruthy();
    expect(cookieValue(second, 'toobler_refresh')).toBeUndefined();
    expect((await sessionOf(person)).revoked_at).toBeNull();
    // The first tab's new token still works
    expect((await refresh(cookieValue(first, 'toobler_refresh')!)).statusCode).toBe(200);
  });

  it('three requests with the same token at the same moment: all succeed, exactly one swaps the token', async () => {
    const person = await createSignedInPerson(app, database);
    const results = await Promise.all([
      refresh(person.refreshToken),
      refresh(person.refreshToken),
      refresh(person.refreshToken),
    ]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200, 200]);
    expect(results.filter((result) => cookieValue(result, 'toobler_refresh') !== undefined)).toHaveLength(1);
    expect((await sessionOf(person)).revoked_at).toBeNull();
  });

  it('used again after the grace window means it was copied: the whole session ends, and the log says so', async () => {
    const person = await createSignedInPerson(app, database);
    const legitimate = await refresh(person.refreshToken);
    const newRefresh = cookieValue(legitimate, 'toobler_refresh')!;
    const newAccess = cookieValue(legitimate, 'toobler_access')!;
    await ageSession(person, 'rotated_at', 5 * MINUTE);

    const thief = await refresh(person.refreshToken); // the old token comes back
    expect(thief.statusCode).toBe(401);
    expect(thief.json().error.code).toBe('SESSION_ENDED');

    const session = await sessionOf(person);
    expect(session.revoked_at).not.toBeNull();
    expect(session.revoked_reason).toBe('refresh token reused');
    // The honest owner's newest tokens are dead too: the session is over for everyone
    expect((await refresh(newRefresh)).statusCode).toBe(401);
    expect((await getMe(`toobler_access=${newAccess}`)).statusCode).toBe(401);

    const kinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(kinds.map((line) => line.kind)).toContain('auth.refresh_token_reused');
  });
});

describe('swapping the refresh token', () => {
  it('only works for the request that still holds the current token: a second try with the same one loses', async () => {
    const person = await createSignedInPerson(app, database);
    const session = await sessionOf(person);
    const oldHash = hashSecret(person.refreshToken);
    const swap = (newToken: string) =>
      sessionsRepository.rotateRefreshToken(database.system, {
        sessionId: session.id,
        oldRefreshTokenHash: oldHash,
        newRefreshTokenHash: hashSecret(newToken),
      });
    expect(await swap('first-new-token')).toBe(true);
    expect(await swap('second-new-token')).toBe(false); // it no longer holds the old token
    expect((await sessionOf(person)).refresh_token_hash).toBe(hashSecret('first-new-token'));
  });
});

describe('a refresh that cannot go ahead', () => {
  it('is 401 SESSION_ENDED, with the same answer for every reason', async () => {
    const answers: string[] = [];
    const record = (response: Awaited<ReturnType<typeof refresh>>) => {
      expect(response.statusCode).toBe(401);
      answers.push(JSON.stringify(response.json()));
    };

    record(await refresh(null)); // no cookie
    record(await refresh('x'.repeat(43))); // unknown token

    const idle = await createSignedInPerson(app, database);
    await ageSession(idle, 'last_used_at', 8 * DAY); // nobody refreshed for 8 days (the limit is 7)
    record(await refresh(idle.refreshToken));

    const tooOld = await createSignedInPerson(app, database);
    await ageSession(tooOld, 'expires_at', MINUTE); // past the 30-day maximum
    record(await refresh(tooOld.refreshToken));

    const signedOut = await createSignedInPerson(app, database);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...unsafeRequestHeaders, cookie: signedOut.cookieHeader },
    });
    record(await refresh(signedOut.refreshToken));

    const disabled = await createSignedInPerson(app, database);
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', disabled.profile.user.id)
      .execute();
    record(await refresh(disabled.refreshToken));

    expect(new Set(answers).size).toBe(1); // nothing tells which rule failed
  });

  it('does not rescue a session that is 6 days idle but not 8: the idle limit is 7 days', async () => {
    const person = await createSignedInPerson(app, database);
    await ageSession(person, 'last_used_at', 6 * DAY);
    expect((await refresh(person.refreshToken)).statusCode).toBe(200);
  });

  it('needs our Origin and X-Requested-With headers (CSRF), and the refused try does not use the token up', async () => {
    const person = await createSignedInPerson(app, database);
    const rejected = await refresh(person.refreshToken, {});
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe('CSRF_REJECTED');
    expect((await refresh(person.refreshToken)).statusCode).toBe(200);
  });

  it('never puts a token or the email in the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger });
    const person = await createSignedInPerson(loggingApp, database);
    const response = await refresh(person.refreshToken, unsafeRequestHeaders, loggingApp);
    const newRefresh = cookieValue(response, 'toobler_refresh')!;
    expect(text()).toContain('/api/v1/auth/refresh'); // the logger was really recording
    for (const secret of [person.refreshToken, newRefresh, person.email]) {
      expect(text()).not.toContain(secret);
    }
    await loggingApp.close();
  });
});
