import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createProfileService } from '../src/modules/core/auth/services/profile.service';
import { buildTestApp, captureLogs } from './support/app';
import { createSignedInPerson } from './support/auth';
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

describe('GET /api/v1/me', () => {
  it('answers with the signed-in person and their business', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: person.profile.user.id,
        name: 'Anita Nair',
        email: person.email,
        mobile: '+919847012345',
        role: 'manager',
      },
      business: { id: person.profile.business.id, industry: 'hotel_resort', timeZone: 'Asia/Kolkata' },
    });
  });

  it('gives the same profile that signing up and signing in gave', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    expect(response.json()).toEqual(person.profile);
  });

  it('never contains a password, a hash, a token, or the platform admin flag', async () => {
    const person = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    expect(response.body).not.toMatch(/password|hash|argon|token|platform/i);
    expect(Object.keys(response.json()).sort()).toEqual(['business', 'user']);
  });

  it('shows each person only their own business, never another one', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const firstMe = (await app.inject({ url: '/api/v1/me', headers: { cookie: first.cookieHeader } })).json();
    const secondMe = (await app.inject({ url: '/api/v1/me', headers: { cookie: second.cookieHeader } })).json();
    expect(firstMe.user.id).toBe(first.profile.user.id);
    expect(secondMe.user.id).toBe(second.profile.user.id);
    expect(firstMe.business.id).not.toBe(secondMe.business.id);
    expect(JSON.stringify(firstMe)).not.toContain(second.email);
  });

  it('answers 401 with no cookie, and 401 once the person is disabled', async () => {
    expect((await app.inject('/api/v1/me')).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } })).statusCode).toBe(401);
  });

  it('reads inside the business fence: asking for a person while fenced to another business finds nothing', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const profileService = createProfileService({ database });
    const principalFor = (person: typeof first, accountId: string) => ({
      accountId,
      userId: person.profile.user.id,
      role: 'manager' as const,
      sessionId: randomUUID(),
      isPlatformAdmin: false,
      emailVerified: true,
    });

    // Correct pairing: the person with their own business
    const own = await profileService.getProfile(principalFor(first, first.profile.business.id));
    expect(own.user.id).toBe(first.profile.user.id);

    // Wrong pairing: the first person's id with the second business's fence. The fence hides the row, so it is "not found",
    // exactly as if the person did not exist.
    await expect(profileService.getProfile(principalFor(first, second.profile.business.id))).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('logs nothing personal: no email, token or cookie in the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger });
    const person = await createSignedInPerson(loggingApp, database);
    await loggingApp.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    const logged = text();
    expect(logged).toContain('/api/v1/me'); // the logger was really recording
    for (const secret of [person.email, person.cookieHeader, person.cookieHeader.replace('toobler_access=', '')]) {
      expect(logged, `the log contains "${secret.slice(0, 12)}..."`).not.toContain(secret);
    }
    await loggingApp.close();
  });
});
