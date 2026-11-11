import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
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

/** Reads a business's modules as the business's own manager sees them: module id to state. */
async function readStates(person: SignedInPerson): Promise<Record<string, string>> {
  const response = await app.inject({ url: '/api/v1/modules', headers: { cookie: person.cookieHeader } });
  expect(response.statusCode, response.body).toBe(200);
  return Object.fromEntries(response.json().items.map((item: { id: string; state: string }) => [item.id, item.state]));
}

/** The platform admin puts a module into a business's plan (or takes it out), with the headers the web app sends. */
function setEntitlement(caller: SignedInPerson | null, businessId: string, body: unknown, withCsrfHeaders = true) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/platform/businesses/${businessId}/modules`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(caller ? { cookie: caller.cookieHeader } : {}) },
    payload: body as object,
  });
}

/** The business's manager switches a module on or off. */
function switchModule(person: SignedInPerson, moduleId: string, enabled: boolean) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/modules/${moduleId}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: { enabled },
  });
}

describe('POST /api/v1/platform/businesses/{id}/modules', () => {
  it('puts a module into a business plan, switched off, and the business can then switch it on', async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    expect((await readStates(business))['channel.whatsapp']).toBe('not_in_plan');

    const response = await setEntitlement(admin, business.profile.business.id, {
      moduleId: 'channel.whatsapp',
      entitled: true,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items.find((item: { id: string }) => item.id === 'channel.whatsapp').state).toBe('off');
    expect((await readStates(business))['channel.whatsapp']).toBe('off');

    expect((await switchModule(business, 'channel.whatsapp', true)).statusCode).toBe(200);
    expect((await readStates(business))['channel.whatsapp']).toBe('active');
  });

  it('taking a module out switches it off, switches off what needs it, and keeps the data', async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    const businessId = business.profile.business.id;
    await setEntitlement(admin, businessId, { moduleId: 'feature.followups', entitled: true });
    await switchModule(business, 'feature.followups', true);
    await database.system
      .updateTable('account_modules')
      .set({ settings: { days: 3 } })
      .where('account_id', '=', businessId)
      .where('module_id', '=', 'feature.followups')
      .execute();

    const response = await setEntitlement(admin, businessId, { moduleId: 'engine.leads', entitled: false });
    expect(response.statusCode, response.body).toBe(200);
    const states = await readStates(business);
    expect(states['engine.leads']).toBe('not_in_plan');
    expect(states['feature.followups']).toBe('off'); // it needed the engine
    expect(states['channel.webchat']).toBe('active'); // a channel does not

    const row = await database.system
      .selectFrom('account_modules')
      .select('settings')
      .where('account_id', '=', businessId)
      .where('module_id', '=', 'feature.followups')
      .executeTakeFirstOrThrow();
    expect(row.settings).toEqual({ days: 3 });

    // Putting the engine back does not switch the business's modules on by itself
    await setEntitlement(admin, businessId, { moduleId: 'engine.leads', entitled: true });
    expect((await readStates(business))['engine.leads']).toBe('off');
  });

  it("keeps the business's own on/off choice when a module that is already in the plan is added again", async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    await setEntitlement(admin, business.profile.business.id, { moduleId: 'engine.leads', entitled: true });
    expect((await readStates(business))['engine.leads']).toBe('active');
  });

  it("writes the activity log in the business's name with the admin as the actor, once per real change", async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    const businessId = business.profile.business.id;
    await setEntitlement(admin, businessId, { moduleId: 'channel.email', entitled: true });
    await setEntitlement(admin, businessId, { moduleId: 'channel.email', entitled: true }); // no change

    const logLines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'fields', 'actor'])
      .where('account_id', '=', businessId)
      .where('kind', 'like', 'modules.%entitled')
      .execute();
    expect(logLines).toEqual([
      { kind: 'modules.entitled', fields: ['channel.email'], actor: { kind: 'user', id: admin.profile.user.id } },
    ]);
  });

  it('is for platform admins only: 401 without sign-in, 403 for a business manager, 403 without the CSRF headers', async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    const businessId = business.profile.business.id;
    const body = { moduleId: 'channel.email', entitled: true };
    expect((await setEntitlement(null, businessId, body)).statusCode).toBe(401);
    expect((await setEntitlement(business, businessId, body)).statusCode).toBe(403);
    expect((await setEntitlement(admin, businessId, body, false)).json().error.code).toBe('CSRF_REJECTED');
    expect((await readStates(business))['channel.email']).toBe('not_in_plan'); // nothing changed
  });

  it('answers 404 for a business or module that does not exist, and 400 for a malformed address or body', async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const businessId = admin.profile.business.id;
    const unknownBusiness = await setEntitlement(admin, randomUUID(), { moduleId: 'channel.email', entitled: true });
    expect(unknownBusiness.statusCode).toBe(404);
    const unknownBusinessRemoval = await setEntitlement(admin, randomUUID(), {
      moduleId: 'channel.email',
      entitled: false,
    });
    expect(unknownBusinessRemoval.statusCode).toBe(404);
    expect((await setEntitlement(admin, businessId, { moduleId: 'channel.telegram', entitled: true })).statusCode).toBe(
      404,
    );
    expect((await setEntitlement(admin, 'not-a-uuid', { moduleId: 'channel.email', entitled: true })).statusCode).toBe(
      400,
    );
    expect((await setEntitlement(admin, businessId, { moduleId: 'channel.email' })).statusCode).toBe(400);
    expect((await setEntitlement(admin, businessId, { moduleId: 'channel.email', entitled: 'yes' })).statusCode).toBe(
      400,
    );
    expect(
      (await setEntitlement(admin, businessId, { moduleId: 'channel.email', entitled: true, enabled: true }))
        .statusCode,
    ).toBe(400);
  });

  it("changes only the named business, never another one's plan", async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await setEntitlement(admin, first.profile.business.id, { moduleId: 'channel.email', entitled: true });
    expect((await readStates(first))['channel.email']).toBe('off');
    expect((await readStates(second))['channel.email']).toBe('not_in_plan');
    expect((await readStates(admin))['channel.email']).toBe('not_in_plan');
  });

  it("removing a module from one business never switches off another business's modules", async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    for (const business of [first, second]) {
      await setEntitlement(admin, business.profile.business.id, { moduleId: 'feature.followups', entitled: true });
      await switchModule(business, 'feature.followups', true);
    }
    await setEntitlement(admin, first.profile.business.id, { moduleId: 'engine.leads', entitled: false });
    expect((await readStates(first))['feature.followups']).toBe('off');
    const secondStates = await readStates(second);
    expect(secondStates['engine.leads']).toBe('active');
    expect(secondStates['feature.followups']).toBe('active');
  });

  it('adding a module that is already in the plan and on leaves it on', async () => {
    const admin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
    const business = await createSignedInPerson(app, database);
    await setEntitlement(admin, business.profile.business.id, { moduleId: 'channel.webchat', entitled: true });
    await setEntitlement(admin, business.profile.business.id, { moduleId: 'channel.webchat', entitled: true });
    expect((await readStates(business))['channel.webchat']).toBe('active');
  });
});
