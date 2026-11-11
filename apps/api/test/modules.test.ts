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

/** Reads the business's modules as a map from module id to state. */
async function readStates(person: SignedInPerson): Promise<Record<string, string>> {
  const response = await app.inject({ url: '/api/v1/modules', headers: { cookie: person.cookieHeader } });
  expect(response.statusCode, response.body).toBe(200);
  return Object.fromEntries(response.json().items.map((item: { id: string; state: string }) => [item.id, item.state]));
}

/** Switches a module on or off as the given person, with the headers the web app sends. */
function switchModule(person: SignedInPerson | null, moduleId: string, body: unknown, withCsrfHeaders = true) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/modules/${moduleId}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });
}

/** Puts a module into a business's plan, the way the platform will (F03 slice 2) - straight into the database for now. */
async function addToPlan(person: SignedInPerson, moduleId: string, enabled = false) {
  await database.system
    .insertInto('account_modules')
    .values({ account_id: person.profile.business.id, module_id: moduleId, entitled: true, enabled })
    .execute();
}

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

describe('GET /api/v1/modules', () => {
  it('shows a new business the lead engine and website chat on, and the rest not in its plan', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await app.inject({ url: '/api/v1/modules', headers: { cookie: person.cookieHeader } });
    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    expect(items.map((item: { id: string }) => item.id)).toEqual([
      'engine.leads',
      'channel.webchat',
      'channel.whatsapp',
      'channel.email',
      'channel.phone',
      'feature.followups',
      'feature.assistant',
      'feature.competitors',
    ]);
    expect(await readStates(person)).toEqual({
      'engine.leads': 'active',
      'channel.webchat': 'active',
      'channel.whatsapp': 'not_in_plan',
      'channel.email': 'not_in_plan',
      'channel.phone': 'not_in_plan',
      'feature.followups': 'not_in_plan',
      'feature.assistant': 'not_in_plan',
      'feature.competitors': 'not_in_plan',
    });
    expect(items[0]).toMatchObject({ kind: 'engine', name: 'Lead engine', requires: [] });
  });

  it('is for signed-in people only (401), and the verification rule applies (403)', async () => {
    const anonymous = await app.inject({ url: '/api/v1/modules' });
    expect(anonymous.statusCode).toBe(401);
    const unverified = await createSignedInPerson(app, database, { verified: false });
    const response = await app.inject({ url: '/api/v1/modules', headers: { cookie: unverified.cookieHeader } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('lets ordinary staff read the list', async () => {
    const person = await createSignedInPerson(app, database);
    await makeStaff(person);
    expect((await readStates(person))['engine.leads']).toBe('active');
  });

  it('shows only the signed-in business, never another one', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addToPlan(first, 'channel.email');
    expect((await readStates(first))['channel.email']).toBe('off');
    expect((await readStates(second))['channel.email']).toBe('not_in_plan');
  });
});

describe('PATCH /api/v1/modules/{id}', () => {
  it('switches a module off and on again, answers with the whole list, and keeps the module settings', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    await database.system
      .updateTable('account_modules')
      .set({ settings: { greeting: 'Hello!' } })
      .where('account_id', '=', businessId)
      .where('module_id', '=', 'channel.webchat')
      .execute();

    const off = await switchModule(person, 'channel.webchat', { enabled: false });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json().items.find((item: { id: string }) => item.id === 'channel.webchat').state).toBe('off');
    expect((await readStates(person))['channel.webchat']).toBe('off');

    const on = await switchModule(person, 'channel.webchat', { enabled: true });
    expect(on.statusCode, on.body).toBe(200);
    expect((await readStates(person))['channel.webchat']).toBe('active');

    const row = await database.system
      .selectFrom('account_modules')
      .select(['settings', 'enabled_at', 'disabled_at'])
      .where('account_id', '=', businessId)
      .where('module_id', '=', 'channel.webchat')
      .executeTakeFirstOrThrow();
    expect(row.settings).toEqual({ greeting: 'Hello!' }); // switching off keeps the data
    expect(row.disabled_at).not.toBeNull();
  });

  it('needs sign-in (401), a manager (403) and our Origin and header (403)', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await switchModule(null, 'channel.webchat', { enabled: false })).statusCode).toBe(401);
    expect((await switchModule(person, 'channel.webchat', { enabled: false }, false)).json().error.code).toBe(
      'CSRF_REJECTED',
    );
    await makeStaff(person);
    const forStaff = await switchModule(person, 'channel.webchat', { enabled: false });
    expect(forStaff.statusCode).toBe(403);
    expect((await readStates(person))['channel.webchat']).toBe('active'); // nothing changed
  });

  it('answers 404 for a module that does not exist and 400 for a malformed id or body', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await switchModule(person, 'channel.telegram', { enabled: true })).statusCode).toBe(404);
    expect((await switchModule(person, 'NotAModule', { enabled: true })).statusCode).toBe(400);
    expect((await switchModule(person, 'channel.webchat', {})).statusCode).toBe(400);
    expect((await switchModule(person, 'channel.webchat', { enabled: 'yes' })).statusCode).toBe(400);
    expect((await switchModule(person, 'channel.webchat', { enabled: true, entitled: true })).statusCode).toBe(400);
  });

  it('refuses to switch on a module that is not in the plan (409 NOT_IN_PLAN)', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await switchModule(person, 'channel.whatsapp', { enabled: true });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_IN_PLAN');
    expect((await readStates(person))['channel.whatsapp']).toBe('not_in_plan');
  });

  it('refuses a feature while its engine is off (409 NEEDS_MODULE, naming the engine)', async () => {
    const person = await createSignedInPerson(app, database);
    await addToPlan(person, 'feature.followups');
    await switchModule(person, 'engine.leads', { enabled: false });
    const response = await switchModule(person, 'feature.followups', { enabled: true });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'NEEDS_MODULE', details: { moduleId: 'engine.leads' } });
  });

  it('switching the engine off also switches off the features that need it', async () => {
    const person = await createSignedInPerson(app, database);
    await addToPlan(person, 'feature.followups', true);
    await addToPlan(person, 'feature.assistant', false);
    expect((await readStates(person))['feature.followups']).toBe('active');

    const response = await switchModule(person, 'engine.leads', { enabled: false });
    expect(response.statusCode).toBe(200);
    const states = await readStates(person);
    expect(states['engine.leads']).toBe('off');
    expect(states['feature.followups']).toBe('off');
    expect(states['channel.webchat']).toBe('active'); // a channel does not need the engine

    // And the feature can come back only after the engine does
    await switchModule(person, 'engine.leads', { enabled: true });
    expect((await readStates(person))['feature.followups']).toBe('off'); // not switched back on by itself
    expect((await switchModule(person, 'feature.followups', { enabled: true })).statusCode).toBe(200);
  });

  it('writes the activity log and an event for each change, and nothing when nothing changed', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    await switchModule(person, 'channel.webchat', { enabled: false });
    await switchModule(person, 'channel.webchat', { enabled: false }); // already off: no change

    const logLines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'fields', 'actor'])
      .where('account_id', '=', businessId)
      .where('kind', 'like', 'modules.%')
      .execute();
    expect(logLines).toEqual([
      { kind: 'modules.disabled', fields: ['channel.webchat'], actor: { kind: 'user', id: person.profile.user.id } },
    ]);
    const events = await database.system
      .selectFrom('domain_events')
      .select(['name', 'payload'])
      .where('account_id', '=', businessId)
      .where('name', 'like', 'module.%')
      .execute();
    expect(events).toEqual([{ name: 'module.disabled', payload: { moduleId: 'channel.webchat' } }]);
  });

  it("never touches another business's modules", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await switchModule(first, 'channel.webchat', { enabled: false });
    expect((await readStates(first))['channel.webchat']).toBe('off');
    expect((await readStates(second))['channel.webchat']).toBe('active');
  });
});

describe('the database protects the plan', () => {
  it('stops the app role from changing `entitled`, adding a module to a plan or deleting a row', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction.updateTable('account_modules').set({ entitled: false }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction
          .insertInto('account_modules')
          .values({ account_id: businessId, module_id: 'channel.whatsapp', entitled: true, enabled: true })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction.deleteFrom('account_modules').execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a module that is switched on but not in the plan', async () => {
    const person = await createSignedInPerson(app, database);
    await expect(
      database.system
        .insertInto('account_modules')
        .values({ account_id: person.profile.business.id, module_id: 'channel.email', entitled: false, enabled: true })
        .execute(),
    ).rejects.toThrow(/account_modules_enabled_needs_entitlement/);
  });
});
