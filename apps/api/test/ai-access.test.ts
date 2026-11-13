import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let platformAdmin: SignedInPerson;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  platformAdmin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const send = (person: SignedInPerson | null, method: 'GET' | 'PUT', businessId: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1/platform/businesses/${businessId}/ai-access`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const getAccess = (person: SignedInPerson | null, businessId: string) => send(person, 'GET', businessId);
const putAccess = (person: SignedInPerson | null, businessId: string, body: unknown) =>
  send(person, 'PUT', businessId, body);

describe('GET /api/v1/platform/businesses/{id}/ai-access', () => {
  it('shows a business that has never been set up: nothing switched on, no cap, no end date, notices on', async () => {
    const business = await createSignedInPerson(app, database);
    const response = await getAccess(platformAdmin, business.profile.business.id);
    expect(response.statusCode, response.body).toBe(200);
    const stored = await database.system
      .selectFrom('accounts')
      .select('name')
      .where('id', '=', business.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(response.json()).toEqual({
      businessId: business.profile.business.id,
      businessName: stored.name,
      keyMode: 'own',
      enabled: false,
      monthlyCallCap: null,
      expiresAt: null,
      noticesEnabled: true,
      ownKeyCount: 0,
    });
  });

  it('counts the keys the business saved for itself, and never shows one', async () => {
    const business = await createSignedInPerson(app, database);
    const key = `AIzaSyAccess${randomUUID().replace(/-/g, '')}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/keys',
      headers: { ...unsafeRequestHeaders, cookie: business.cookieHeader },
      payload: { provider: 'gemini', label: 'Theirs', key },
    });
    const response = await getAccess(platformAdmin, business.profile.business.id);
    expect(response.json().ownKeyCount).toBe(1);
    expect(response.body).not.toContain(key);
  });

  it('answers 404 for a business that does not exist', async () => {
    expect((await getAccess(platformAdmin, randomUUID())).statusCode).toBe(404);
  });

  it('answers 400 for an id that is not an id, 401 when nobody is signed in, and 403 to anyone who is not a platform admin', async () => {
    expect((await getAccess(platformAdmin, 'not-an-id')).statusCode).toBe(400);
    const business = await createSignedInPerson(app, database);
    expect((await getAccess(null, business.profile.business.id)).statusCode).toBe(401);
    // even the business's own manager may not look at (or change) what the platform decided
    expect((await getAccess(business, business.profile.business.id)).statusCode).toBe(403);
  });
});

describe('PUT /api/v1/platform/businesses/{id}/ai-access', () => {
  it('switches the platform’s keys on for a business, with a cap and an end date, and the business sees it', async () => {
    const business = await createSignedInPerson(app, database);
    const endsAt = '2031-06-30T00:00:00.000Z';
    const response = await putAccess(platformAdmin, business.profile.business.id, {
      enabled: true,
      monthlyCallCap: 300,
      expiresAt: endsAt,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      enabled: true,
      monthlyCallCap: 300,
      expiresAt: endsAt,
      noticesEnabled: true,
    });
    const seenByBusiness = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/settings',
      headers: { ...unsafeRequestHeaders, cookie: business.cookieHeader },
    });
    expect(seenByBusiness.json().platformAccess).toEqual({ enabled: true, monthlyCallCap: 300, expiresAt: endsAt });
  });

  it('changes only the fields sent, and null clears the cap and the end date', async () => {
    const business = await createSignedInPerson(app, database);
    const id = business.profile.business.id;
    await putAccess(platformAdmin, id, { enabled: true, monthlyCallCap: 50, expiresAt: '2031-01-01T00:00:00.000Z' });
    const onlyNotices = await putAccess(platformAdmin, id, { noticesEnabled: false });
    expect(onlyNotices.json()).toMatchObject({ enabled: true, monthlyCallCap: 50, noticesEnabled: false });
    const cleared = await putAccess(platformAdmin, id, { monthlyCallCap: null, expiresAt: null });
    expect(cleared.json()).toMatchObject({
      enabled: true,
      monthlyCallCap: null,
      expiresAt: null,
      noticesEnabled: false,
    });
    const switchedOff = await putAccess(platformAdmin, id, { enabled: false });
    expect(switchedOff.json().enabled).toBe(false);
  });

  it('does not touch what the manager chose (key mode, own models)', async () => {
    const business = await createSignedInPerson(app, database);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      headers: { ...unsafeRequestHeaders, cookie: business.cookieHeader },
      payload: { keyMode: 'own_then_platform' },
    });
    await putAccess(platformAdmin, business.profile.business.id, { enabled: true });
    const row = await database.system
      .selectFrom('ai_settings')
      .selectAll()
      .where('account_id', '=', business.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(row.key_mode).toBe('own_then_platform');
    expect(row.platform_enabled).toBe(true);
  });

  it('writes a log line in the business’s own history (by “the platform”) and one in the admin’s business (by the admin), plus an event', async () => {
    const business = await createSignedInPerson(app, database);
    const id = business.profile.business.id;
    await putAccess(platformAdmin, id, { enabled: true, monthlyCallCap: 10 });
    const businessLog = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', id)
      .where('kind', '=', 'ai.access_changed')
      .execute();
    expect(businessLog).toHaveLength(1);
    expect(businessLog[0]?.actor).toEqual({ kind: 'system', id: 'platform' });
    expect(businessLog[0]?.fields).toEqual(['enabled', 'monthlyCallCap']);
    const adminLog = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', platformAdmin.profile.business.id)
      .where('kind', '=', 'platform.ai_access_changed')
      .where('record_id', '=', id)
      .execute();
    expect(adminLog).toHaveLength(1);
    expect(adminLog[0]?.actor).toEqual({ kind: 'user', id: platformAdmin.profile.user.id });
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', id)
      .where('name', '=', 'ai.access_changed')
      .execute();
    expect(events).toHaveLength(1);
  });

  it('lets an admin change their own business without a duplicate log line', async () => {
    await putAccess(platformAdmin, platformAdmin.profile.business.id, { enabled: true });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', platformAdmin.profile.business.id)
      .where('kind', 'in', ['ai.access_changed', 'platform.ai_access_changed'])
      .where('record_id', 'is', null)
      .execute();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.every((line) => line.kind === 'ai.access_changed')).toBe(true);
  });

  it('answers 404 for an unknown business and creates nothing', async () => {
    const unknownId = randomUUID();
    expect((await putAccess(platformAdmin, unknownId, { enabled: true })).statusCode).toBe(404);
    const rows = await database.system
      .selectFrom('ai_settings')
      .select('account_id')
      .where('account_id', '=', unknownId)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('answers 400 for nothing to change, a negative or huge cap, a bad date, wrong types and fields it does not know', async () => {
    const business = await createSignedInPerson(app, database);
    const id = business.profile.business.id;
    const nothing = await putAccess(platformAdmin, id, {});
    expect(nothing.statusCode).toBe(400);
    expect(nothing.json().error.code).toBe('NOTHING_TO_CHANGE');
    const bad: unknown[] = [
      { monthlyCallCap: -1 },
      { monthlyCallCap: 10_000_001 },
      { monthlyCallCap: 1.5 },
      { expiresAt: 'tomorrow' },
      { expiresAt: '2031-06-30' },
      { enabled: 'yes' },
      { keyMode: 'platform' },
      { taskModels: {} },
      'not an object',
    ];
    for (const body of bad) {
      expect((await putAccess(platformAdmin, id, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await getAccess(platformAdmin, id)).json().enabled).toBe(false);
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s own manager (who cannot give themselves access)', async () => {
    const business = await createSignedInPerson(app, database);
    expect((await putAccess(null, business.profile.business.id, { enabled: true })).statusCode).toBe(401);
    expect((await putAccess(business, business.profile.business.id, { enabled: true })).statusCode).toBe(403);
    expect((await getAccess(platformAdmin, business.profile.business.id)).json().enabled).toBe(false);
  });
});
