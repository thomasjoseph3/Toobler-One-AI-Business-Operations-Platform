import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listPlatformAdmins, setPlatformAdmin, tidyEmail } from '../../../scripts/platform-admin-core';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
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

/** Calls a platform-only route as the person: 200 for a platform admin, 403 for everyone else. */
const callPlatformRoute = (person: SignedInPerson) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/platform/ai/keys',
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
  });

describe('npm run platform-admin (the logic behind it)', () => {
  it('makes a signed-up, verified person a platform admin; their next request is allowed, no new sign-in needed', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await callPlatformRoute(person)).statusCode).toBe(403);
    const result = await setPlatformAdmin(database.pool, person.email, true);
    expect(result).toEqual({ outcome: 'changed', email: person.email, isPlatformAdmin: true });
    expect((await callPlatformRoute(person)).statusCode).toBe(200);
  });

  it('takes it away again, and the next request is refused', async () => {
    const person = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    expect((await callPlatformRoute(person)).statusCode).toBe(200);
    expect(await setPlatformAdmin(database.pool, person.email, false)).toEqual({
      outcome: 'changed',
      email: person.email,
      isPlatformAdmin: false,
    });
    expect((await callPlatformRoute(person)).statusCode).toBe(403);
  });

  it('saying the same thing twice changes nothing and writes no second log line', async () => {
    const person = await createSignedInPerson(app, database);
    await setPlatformAdmin(database.pool, person.email, true);
    expect(await setPlatformAdmin(database.pool, person.email, true)).toEqual({
      outcome: 'already',
      email: person.email,
      isPlatformAdmin: true,
    });
    expect(await setPlatformAdmin(database.pool, `  ${person.email.toUpperCase()}  `, true)).toMatchObject({
      outcome: 'already',
    });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'platform.admin_granted')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.actor).toEqual({ kind: 'system', id: 'command-line' });
    expect(lines[0]?.fields).toEqual(['isPlatformAdmin']);
    expect(await setPlatformAdmin(database.pool, person.email, false)).toMatchObject({ outcome: 'changed' });
    expect(await setPlatformAdmin(database.pool, person.email, false)).toMatchObject({ outcome: 'already' });
  });

  it('finds the person whatever the capitals or spaces in the email, and says so when there is no such person', async () => {
    const person = await createSignedInPerson(app, database);
    expect(await setPlatformAdmin(database.pool, `  ${person.email.toUpperCase()}\n`, true)).toMatchObject({
      outcome: 'changed',
      email: person.email,
    });
    expect(await setPlatformAdmin(database.pool, `nobody-${randomUUID()}@example.com`, true)).toMatchObject({
      outcome: 'not_found',
    });
  });

  it('refuses to make someone an admin who has not verified their email or is switched off, but lets an admin be removed regardless', async () => {
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect(await setPlatformAdmin(database.pool, unverified.email, true)).toEqual({
      outcome: 'refused',
      email: unverified.email,
      reason: 'that person has not verified their email yet',
    });
    const disabled = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    await database.system
      .updateTable('users')
      .set({ status: 'disabled' })
      .where('id', '=', disabled.profile.user.id)
      .execute();
    expect(await setPlatformAdmin(database.pool, disabled.email, false)).toMatchObject({ outcome: 'changed' });
    expect(await setPlatformAdmin(database.pool, disabled.email, true)).toMatchObject({
      outcome: 'refused',
      reason: 'that person is switched off',
    });
    const rows = await database.system
      .selectFrom('users')
      .select('is_platform_admin')
      .where('id', '=', unverified.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(rows.is_platform_admin).toBe(false);
  });

  it('lists the platform admins with their name and business', async () => {
    const person = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const admins = await listPlatformAdmins(database.pool);
    expect(admins.map((admin) => admin.email)).toContain(person.email);
    expect(Object.keys(admins[0] ?? {}).sort()).toEqual(['businessName', 'email', 'name']);
  });

  it('refuses text that is not an email before touching the database', () => {
    expect(tidyEmail('  Thomas@Example.COM ')).toBe('thomas@example.com');
    for (const bad of [
      '',
      'no-at-sign',
      'two@@example.com',
      'a b@example.com',
      'x@y',
      `${'a'.repeat(250)}@example.com`,
    ]) {
      expect(() => tidyEmail(bad), bad).toThrow(/does not look like an email/);
    }
  });
});
