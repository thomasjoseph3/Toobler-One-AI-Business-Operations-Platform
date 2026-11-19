import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/** PATCH /me as a person (or with nobody signed in). */
const updateProfile = (
  person: SignedInPerson | null,
  payload: unknown,
  headers: Record<string, string> = unsafeRequestHeaders,
) =>
  app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: { ...headers, ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: payload as object,
  });

const getMe = (person: SignedInPerson) => app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });

describe('PATCH /api/v1/me', () => {
  it('changes the name only, and answers with the updated profile', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await updateProfile(person, { name: '  Meera Menon ' });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ name: 'Meera Menon', mobile: '+919847012345' });
    expect((await getMe(person)).json().user.name).toBe('Meera Menon');
  });

  it('changes the mobile only, in the same stored form as at sign-up', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await updateProfile(person, { mobile: '098 765 43210' });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.mobile).toBe('+919876543210');
    const row = await database.system
      .selectFrom('users')
      .select(['mobile_e164', 'mobile_key', 'name'])
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ mobile_e164: '+919876543210', mobile_key: '9876543210', name: 'Anita Nair' });
  });

  it('changes both at once', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await updateProfile(person, { name: 'Meera Menon', mobile: '+44 7700 900123' });
    expect(response.json().user).toMatchObject({ name: 'Meera Menon', mobile: '+447700900123' });
  });

  it('refuses a mobile number that cannot be one (400 INVALID_MOBILE) and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await updateProfile(person, { name: 'Meera Menon', mobile: 'call me maybe' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_MOBILE');
    expect((await getMe(person)).json().user.name).toBe('Anita Nair');
  });

  it('refuses an empty body, empty values, and any other field: email, role, business, platform admin (400)', async () => {
    const person = await createSignedInPerson(app, database);
    for (const payload of [
      {},
      { name: '   ' },
      { name: 'x'.repeat(101) },
      { email: 'someone@example.com' },
      { name: 'Meera', role: 'staff' },
      { name: 'Meera', accountId: person.profile.business.id },
      { name: 'Meera', isPlatformAdmin: true },
      { name: 'Meera', emailVerified: false },
    ]) {
      const response = await updateProfile(person, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const row = await database.system
      .selectFrom('users')
      .select(['email', 'role', 'is_platform_admin', 'name'])
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ email: person.email, role: 'manager', is_platform_admin: false, name: 'Anita Nair' });
  });

  it('only ever changes the person making the request, never anyone else', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await updateProfile(first, { name: 'Changed Name' });
    expect((await getMe(second)).json().user.name).toBe('Anita Nair');
    // Even naming the other person's id is refused, because the body allows nothing but name and mobile
    const sneaky = await updateProfile(first, { name: 'Hacked', id: second.profile.user.id });
    expect(sneaky.statusCode).toBe(400);
    expect((await getMe(second)).json().user.name).toBe('Anita Nair');
  });

  it('records who changed it and when, and writes the activity log without the new values', async () => {
    const person = await createSignedInPerson(app, database);
    await updateProfile(person, { name: 'Meera Menon', mobile: '+44 7700 900123' });
    const row = await database.system
      .selectFrom('users')
      .select(['updated_by', 'updated_at', 'created_at'])
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.updated_at.getTime()).toBeGreaterThanOrEqual(row.created_at.getTime());
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'auth.profile_updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('Meera');
    expect(JSON.stringify(lines)).not.toContain('7700');
  });

  it('needs a session (401), a verified email (403), and our headers (403 CSRF)', async () => {
    expect((await updateProfile(null, { name: 'Meera' })).statusCode).toBe(401);

    const unverified = await createSignedInPerson(app, database, { verified: false });
    const blocked = await updateProfile(unverified, { name: 'Meera' });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('EMAIL_NOT_VERIFIED');

    const person = await createSignedInPerson(app, database);
    const noHeaders = await updateProfile(person, { name: 'Meera' }, {});
    expect(noHeaders.statusCode).toBe(403);
    expect(noHeaders.json().error.code).toBe('CSRF_REJECTED');
    expect((await getMe(person)).json().user.name).toBe('Anita Nair');
  });
});
