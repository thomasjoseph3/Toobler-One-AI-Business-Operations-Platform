import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let admin: SignedInPerson;
let owner: SignedInPerson;
const addedIds: string[] = [];

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
  owner = await createSignedInPerson(app, database); // an ordinary business owner
});
afterAll(async () => {
  // Switch off what the tests added, so the other test files still see exactly the seeded list
  if (addedIds.length > 0) {
    await database.system.updateTable('industries').set({ is_active: false }).where('id', 'in', addedIds).execute();
  }
  await app.close();
  await database.close();
});

/** A new industry id no other test uses. */
const newIndustryId = () => `test_${randomUUID().slice(0, 8)}`;

/** POST /industries as a person (or with nobody signed in), with the CSRF headers our web app sends. */
const addIndustryAs = (person: SignedInPerson | null, payload: unknown, extraHeaders: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/industries',
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}), ...extraHeaders },
    payload: payload as object,
  });

const listedIds = async () =>
  (await app.inject('/api/v1/industries')).json().items.map((industry: { id: string }) => industry.id) as string[];

describe('POST /api/v1/industries', () => {
  it('lets a platform admin add an industry, and it shows up in the list straight away', async () => {
    const id = newIndustryId();
    addedIds.push(id);
    const response = await addIndustryAs(admin, { id, label: 'Test salon' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id, label: 'Test salon' });
    const ids = await listedIds();
    expect(ids).toContain(id);
    // Default placement: after the seeded industries and before "Something else"
    expect(ids.indexOf(id)).toBeGreaterThan(ids.indexOf('retail'));
    expect(ids.indexOf(id)).toBeLessThan(ids.indexOf('other'));
  });

  it('puts an industry where the sort order says', async () => {
    const id = newIndustryId();
    addedIds.push(id);
    expect((await addIndustryAs(admin, { id, label: 'Early one', sortOrder: 15 })).statusCode).toBe(201);
    const ids = await listedIds();
    expect(ids.indexOf(id)).toBe(ids.indexOf('general') + 1); // 15 sits just after general (10)
  });

  it('answers 401 when nobody is signed in', async () => {
    const response = await addIndustryAs(null, { id: newIndustryId(), label: 'Nope' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('answers 403 to an ordinary business owner, even a manager, and adds nothing', async () => {
    const id = newIndustryId();
    const response = await addIndustryAs(owner, { id, label: 'Sneaky' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    const saved = await database.system.selectFrom('industries').select('id').where('id', '=', id).execute();
    expect(saved).toEqual([]);
  });

  it('answers 409 for an id that already exists, even when two requests arrive together', async () => {
    const id = newIndustryId();
    addedIds.push(id);
    expect((await addIndustryAs(admin, { id, label: 'First' })).statusCode).toBe(201);
    const again = await addIndustryAs(admin, { id, label: 'Second' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('INDUSTRY_EXISTS');
    expect((await addIndustryAs(admin, { id: 'clinic', label: 'Clash with a seeded one' })).statusCode).toBe(409);

    const raceId = newIndustryId();
    addedIds.push(raceId);
    const results = await Promise.all([
      addIndustryAs(admin, { id: raceId, label: 'Race one' }),
      addIndustryAs(admin, { id: raceId, label: 'Race two' }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  });

  it('refuses bad input with a 400 that names the field', async () => {
    const attempts: [Record<string, unknown>, string][] = [
      [{ id: 'Salon', label: 'Uppercase id' }, 'id'],
      [{ id: 'has space', label: 'Space in id' }, 'id'],
      [{ id: '1salon', label: 'Starts with a digit' }, 'id'],
      [{ id: 'a', label: 'Too short' }, 'id'],
      [{ id: 'x'.repeat(41), label: 'Too long' }, 'id'],
      [{ id: newIndustryId(), label: '' }, 'label'],
      [{ id: newIndustryId(), label: 'x'.repeat(81) }, 'label'],
      [{ id: newIndustryId(), label: 'Bad order', sortOrder: 0 }, 'sortOrder'],
      [{ id: newIndustryId(), label: 'Bad order', sortOrder: 999 }, 'sortOrder'],
      [{ id: newIndustryId(), label: 'Not a whole number', sortOrder: 5.5 }, 'sortOrder'],
      [{ label: 'No id' }, 'id'],
    ];
    for (const [payload, field] of attempts) {
      const response = await addIndustryAs(admin, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().error.details).toEqual([expect.objectContaining({ path: field })]);
    }
    expect((await addIndustryAs(admin, {})).statusCode).toBe(400);
  });

  it('refuses a request that does not come from our own app (CSRF), even from a platform admin', async () => {
    const id = newIndustryId();
    const withoutHeaders = await app.inject({
      method: 'POST',
      url: '/api/v1/industries',
      headers: { cookie: admin.cookieHeader },
      payload: { id, label: 'No headers' },
    });
    expect(withoutHeaders.statusCode).toBe(403);
    expect(withoutHeaders.json().error.code).toBe('CSRF_REJECTED');
    const foreignOrigin = await addIndustryAs(admin, { id, label: 'Foreign' }, { origin: 'https://evil.example' });
    expect(foreignOrigin.statusCode).toBe(403);
    const saved = await database.system.selectFrom('industries').select('id').where('id', '=', id).execute();
    expect(saved).toEqual([]);
  });

  it('records who added it, without storing the values', async () => {
    const id = newIndustryId();
    addedIds.push(id);
    await addIndustryAs(admin, { id, label: 'Logged one' });
    const lines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'record_type', 'fields', 'actor'])
      .where('account_id', '=', admin.profile.business.id)
      .where('kind', '=', 'industries.added')
      .execute();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.at(-1)).toMatchObject({
      record_type: 'industry',
      fields: ['id', 'label'], // the names of the fields, never their values
      actor: { kind: 'user', id: admin.profile.user.id },
    });
    expect(JSON.stringify(lines)).not.toContain('Logged one');
  });

  it('works for sign-up straight away: a business can pick the new industry', async () => {
    const id = newIndustryId();
    addedIds.push(id);
    await addIndustryAs(admin, { id, label: 'Brand new' });
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: unsafeRequestHeaders,
      payload: {
        name: 'New Owner',
        businessName: `Brand New Co ${randomUUID().slice(0, 6)}`,
        email: `new-${randomUUID().slice(0, 8)}@example.com`,
        mobile: '9847012345',
        password: 'river-lamp-kettle-42',
        industry: id,
      },
    });
    expect(signUp.statusCode, signUp.body).toBe(201);
    expect(signUp.json().business.industry).toBe(id);
  });
});
