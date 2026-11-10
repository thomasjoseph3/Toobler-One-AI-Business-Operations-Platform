import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { defineModule } from '../src/kernel/module-system/define';
import { signAccessToken } from '../src/modules/core/auth/helpers/tokens';
import { buildTestApp, testConfig } from './support/app';
import { createSignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

// A route that any signed-in person may call. It answers with who the server thinks is calling, so the tests can see
// exactly what the authenticator found.
const whoAmIModule = defineModule({
  id: 'core.whoami',
  kind: 'core',
  routes: (moduleApp) => {
    moduleApp.get('/who-am-i', { config: { access: 'staff' } }, async (request) => request.principal);
  },
});

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [whoAmIModule]);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const whoAmI = (cookieHeader?: string) =>
  app.inject({ url: '/api/v1/who-am-i', ...(cookieHeader ? { headers: { cookie: cookieHeader } } : {}) });

describe('knowing who is signed in', () => {
  it('finds the person, their business and role from the access cookie', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await whoAmI(person.cookieHeader);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      userId: person.profile.user.id,
      accountId: person.profile.business.id,
      role: 'manager',
      isPlatformAdmin: false,
    });
  });

  it('answers 401 when there is no cookie', async () => {
    const response = await whoAmI();
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a forged, edited or foreign token', async () => {
    const person = await createSignedInPerson(app, database);
    const realToken = person.cookieHeader.replace('toobler_access=', '');
    const [header, , signature] = realToken.split('.');
    const forgedTokens = [
      'garbage',
      `${realToken}x`,
      `${header}.${Buffer.from('{"sub":"someone","sid":"x"}').toString('base64url')}.${signature}`,
      // Signed with a secret we do not use
      await signAccessToken(
        { userId: person.profile.user.id, sessionId: person.profile.user.id },
        { secret: 'x'.repeat(40), minutes: 15 },
      ),
    ];
    for (const forged of forgedTokens) {
      const response = await whoAmI(`toobler_access=${forged}`);
      expect(response.statusCode, forged.slice(0, 20)).toBe(401);
    }
  });

  it('answers TOKEN_EXPIRED for an expired token, so the app knows to refresh it', async () => {
    const person = await createSignedInPerson(app, database);
    const session = await database.system
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    const expiredToken = await signAccessToken(
      { userId: person.profile.user.id, sessionId: session.id },
      { secret: testConfig().auth.jwtSecret, minutes: 15 },
      new Date(Date.now() - 60 * 60_000), // signed an hour ago, valid for 15 minutes
    );
    const response = await whoAmI(`toobler_access=${expiredToken}`);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_EXPIRED');
  });

  it('stops a valid token the moment its session is ended, not 15 minutes later', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await whoAmI(person.cookieHeader)).statusCode).toBe(200);
    await database.system
      .updateTable('sessions')
      .set({ revoked_at: sql`now()` })
      .where('user_id', '=', person.profile.user.id)
      .execute();
    const response = await whoAmI(person.cookieHeader);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_ENDED');
  });

  it('stops a session that has passed its maximum age', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('sessions')
      .set({ expires_at: sql`now() - interval '1 second'` })
      .where('user_id', '=', person.profile.user.id)
      .execute();
    expect((await whoAmI(person.cookieHeader)).json().error.code).toBe('SESSION_ENDED');
  });

  it('stops a person who has been disabled, at once', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await whoAmI(person.cookieHeader)).statusCode).toBe(401);
  });

  it('does not let one person use another person’s session', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const firstSession = await database.system
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', first.profile.user.id)
      .executeTakeFirstOrThrow();
    // A token that names the second person but the first person's session
    const mixedUpToken = await signAccessToken(
      { userId: second.profile.user.id, sessionId: firstSession.id },
      { secret: testConfig().auth.jwtSecret, minutes: 15 },
    );
    expect((await whoAmI(`toobler_access=${mixedUpToken}`)).statusCode).toBe(401);
  });

  it('reads the platform admin flag from the database on every request, so a change takes effect without signing in again', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await whoAmI(person.cookieHeader)).json().isPlatformAdmin).toBe(false);
    await database.system
      .updateTable('users')
      .set({ is_platform_admin: true })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await whoAmI(person.cookieHeader)).json().isPlatformAdmin).toBe(true);
  });
});
