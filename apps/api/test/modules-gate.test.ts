import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { defineModule } from '../src/kernel/module-system/define';
import { createRegistry } from '../src/kernel/module-system/registry';
import { createModuleGate } from '../src/modules/core/module-switches/services/module-gate.service';
import { modules } from '../src/modules';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// A stand-in for a real feature module (follow-ups, F08 and later): one route, so we can see the gate answer 404.
const probeModule = defineModule({
  id: 'feature.followups',
  kind: 'feature',
  requires: [],
  routes: (moduleApp) => {
    moduleApp.get('/followups-probe', { config: { access: 'staff' } }, async () => ({ ok: true }));
  },
});

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [probeModule]);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Calls the probe route as the person. */
const callProbe = (person: SignedInPerson) =>
  app.inject({ url: '/api/v1/followups-probe', headers: { cookie: person.cookieHeader } });

/** Puts the probe's module into the business's plan, on or off, straight into the database. */
async function addProbeToPlan(person: SignedInPerson, enabled: boolean) {
  await database.system
    .insertInto('account_modules')
    .values({ account_id: person.profile.business.id, module_id: 'feature.followups', entitled: true, enabled })
    .execute();
}

/** The business's manager switches a module on or off. */
const switchModule = (person: SignedInPerson, moduleId: string, enabled: boolean) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/modules/${moduleId}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: { enabled },
  });

describe('the module guard on routes', () => {
  it('answers 404 for a module that is not in the plan, as if the route did not exist', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await callProbe(person);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('answers 404 while the module is off, 200 when it is on, and 404 again when it is switched off, keeping the data', async () => {
    const person = await createSignedInPerson(app, database);
    await addProbeToPlan(person, false);
    expect((await callProbe(person)).statusCode).toBe(404);

    expect((await switchModule(person, 'feature.followups', true)).statusCode).toBe(200);
    expect((await callProbe(person)).statusCode).toBe(200);

    await database.system
      .updateTable('account_modules')
      .set({ settings: { days: 3 } })
      .where('account_id', '=', person.profile.business.id)
      .where('module_id', '=', 'feature.followups')
      .execute();
    expect((await switchModule(person, 'feature.followups', false)).statusCode).toBe(200);
    expect((await callProbe(person)).statusCode).toBe(404);
    expect((await switchModule(person, 'feature.followups', true)).statusCode).toBe(200);
    expect((await callProbe(person)).statusCode).toBe(200);
    const row = await database.system
      .selectFrom('account_modules')
      .select('settings')
      .where('account_id', '=', person.profile.business.id)
      .where('module_id', '=', 'feature.followups')
      .executeTakeFirstOrThrow();
    expect(row.settings).toEqual({ days: 3 });
  });

  it('turns the route off when the engine it needs is switched off', async () => {
    const person = await createSignedInPerson(app, database);
    await addProbeToPlan(person, true);
    expect((await callProbe(person)).statusCode).toBe(200);
    await switchModule(person, 'engine.leads', false);
    expect((await callProbe(person)).statusCode).toBe(404);
  });

  it("is per business: another business's switch does not open this one's route", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addProbeToPlan(first, true);
    expect((await callProbe(first)).statusCode).toBe(200);
    expect((await callProbe(second)).statusCode).toBe(404);
  });

  it('still answers 401 to someone not signed in, before it says anything about modules', async () => {
    expect((await app.inject({ url: '/api/v1/followups-probe' })).statusCode).toBe(401);
  });
});

describe('createModuleGate', () => {
  const registry = createRegistry([...modules, probeModule]);

  it('has core modules always on, and a module nobody has in a plan off', async () => {
    const person = await createSignedInPerson(app, database);
    const gate = createModuleGate({ registry, database, cacheSeconds: 0 });
    expect(await gate.isActive(person.profile.business.id, 'core.auth')).toBe(true);
    expect(await gate.isActive(person.profile.business.id, 'feature.followups')).toBe(false);
    expect(await gate.isActive(person.profile.business.id, 'engine.unknown')).toBe(false);
  });

  it('remembers a business for the set time and forgets it on request', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    let nowInMilliseconds = 1_000_000;
    const gate = createModuleGate({ registry, database, cacheSeconds: 10, readClock: () => nowInMilliseconds });

    expect(await gate.isActive(businessId, 'feature.followups')).toBe(false);
    await addProbeToPlan(person, true);
    expect(await gate.isActive(businessId, 'feature.followups')).toBe(false); // still remembered

    gate.forget?.(businessId);
    expect(await gate.isActive(businessId, 'feature.followups')).toBe(true);

    await database.system
      .updateTable('account_modules')
      .set({ enabled: false })
      .where('account_id', '=', businessId)
      .where('module_id', '=', 'feature.followups')
      .execute();
    expect(await gate.isActive(businessId, 'feature.followups')).toBe(true); // remembered
    nowInMilliseconds += 11_000; // the 10 seconds are over
    expect(await gate.isActive(businessId, 'feature.followups')).toBe(false);
  });
});

describe('GET /api/v1/me lists the active modules', () => {
  /** Reads the ids of the active modules from /me. */
  async function readActiveIds(person: SignedInPerson): Promise<string[]> {
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    expect(response.statusCode).toBe(200);
    return response.json().activeModules.map((module: { id: string }) => module.id);
  }

  it('shows a new business the lead engine and website chat, with their names and kinds', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: person.cookieHeader } });
    expect(response.json().activeModules).toEqual([
      { id: 'engine.leads', kind: 'engine', name: 'Lead engine' },
      { id: 'channel.webchat', kind: 'channel', name: 'Website chat' },
    ]);
  });

  it('follows switches: a module that goes off disappears, one that comes on appears, one only in the plan is not listed', async () => {
    const person = await createSignedInPerson(app, database);
    await switchModule(person, 'channel.webchat', false);
    expect(await readActiveIds(person)).toEqual(['engine.leads']);
    await addProbeToPlan(person, false);
    expect(await readActiveIds(person)).toEqual(['engine.leads']);
    await switchModule(person, 'feature.followups', true);
    expect(await readActiveIds(person)).toEqual(['engine.leads', 'feature.followups']);
  });

  it('is also in the answer to PATCH /me', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
      payload: { name: 'Anita N' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().activeModules).toHaveLength(2);
  });
});

describe('a gate that remembers answers still counts a change at once', () => {
  it('after the manager switches a module, and after the platform changes the plan', async () => {
    const rememberingApp = await buildTestApp(database, [probeModule], {
      gate: createModuleGate({ registry: createRegistry([...modules, probeModule]), database, cacheSeconds: 60 }),
    });
    try {
      const admin = await createSignedInPerson(rememberingApp, database, { isPlatformAdmin: true });
      const person = await createSignedInPerson(rememberingApp, database);
      const send = (method: 'GET' | 'PATCH' | 'POST', url: string, caller: SignedInPerson, payload?: object) =>
        rememberingApp.inject({
          method,
          url,
          headers: { ...unsafeRequestHeaders, cookie: caller.cookieHeader },
          ...(payload ? { payload } : {}),
        });

      expect((await send('GET', '/api/v1/followups-probe', person)).statusCode).toBe(404); // remembered as "off"
      await send('POST', `/api/v1/platform/businesses/${person.profile.business.id}/modules`, admin, {
        moduleId: 'feature.followups',
        entitled: true,
      });
      await send('PATCH', '/api/v1/modules/feature.followups', person, { enabled: true });
      expect((await send('GET', '/api/v1/followups-probe', person)).statusCode).toBe(200);

      await send('PATCH', '/api/v1/modules/feature.followups', person, { enabled: false });
      expect((await send('GET', '/api/v1/followups-probe', person)).statusCode).toBe(404);

      await send('PATCH', '/api/v1/modules/feature.followups', person, { enabled: true });
      expect((await send('GET', '/api/v1/followups-probe', person)).statusCode).toBe(200);
      await send('POST', `/api/v1/platform/businesses/${person.profile.business.id}/modules`, admin, {
        moduleId: 'feature.followups',
        entitled: false,
      });
      expect((await send('GET', '/api/v1/followups-probe', person)).statusCode).toBe(404);
    } finally {
      await rememberingApp.close();
    }
  });
});
