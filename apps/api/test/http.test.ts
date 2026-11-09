import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Principal } from '../src/kernel/http/guard';
import { defineModule } from '../src/kernel/modules/define';
import { coreOnlyGate, createRegistry } from '../src/kernel/modules/registry';
import { buildTestApp, captureLogs, testConfig } from './support/app';
import { newAccountId, openTestDatabase } from './support/harness';
import { buildApp } from '../src/app';
import { modules } from '../src/modules';
import type { Database } from '../src/kernel/db';

let database: Database;
beforeAll(() => {
  database = openTestDatabase();
});
afterAll(() => database.close());

describe('health', () => {
  it('is up, public, and tags the response with a request id', async () => {
    const app = await buildTestApp(database);
    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await app.close();
  });

  it('answers 503 when the database does not', async () => {
    const databaseThatIsDown = { ...database, ping: async () => Promise.reject(new Error('boom')) } as Database;
    const app = await buildApp({ config: testConfig(), database: databaseThatIsDown, registry: createRegistry(modules) });
    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: 'database is not responding' });
    await app.close();
  });

  it('sends security headers and ignores a caller-supplied request id', async () => {
    const app = await buildTestApp(database);
    const response = await app.inject({ url: '/api/v1/health', headers: { 'x-request-id': 'attacker-chosen' } });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).not.toBe('attacker-chosen');
    await app.close();
  });
});

describe('errors', () => {
  it('answers an unknown route with the standard shape', async () => {
    const app = await buildTestApp(database);
    const response = await app.inject('/api/v1/nope');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('turns bad input into a 400 with a sentence and the field', async () => {
    const echoModule = defineModule({
      id: 'core.echo',
      kind: 'core',
      routes: (app) => {
        app.post('/echo', { config: { access: 'public' }, schema: { body: z.object({ name: z.string().min(2).max(20) }) } }, async (request) => request.body);
      },
    });
    const app = await buildTestApp(database, [echoModule], { publicRoutes: [{ method: 'POST', path: '/api/v1/echo', reason: 'test' }, { method: 'GET', path: '/api/v1/health', reason: 'test' }] });
    const badInputResponse = await app.inject({ method: 'POST', url: '/api/v1/echo', payload: { name: 'x' } });
    expect(badInputResponse.statusCode).toBe(400);
    expect(badInputResponse.json().error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ path: 'name' }] });
    const brokenJsonResponse = await app.inject({ method: 'POST', url: '/api/v1/echo', headers: { 'content-type': 'application/json' }, payload: '{nope' });
    expect(brokenJsonResponse.statusCode).toBe(400);
    expect(brokenJsonResponse.json().error.code).toBe('BAD_JSON');
    const goodInputResponse = await app.inject({ method: 'POST', url: '/api/v1/echo', payload: { name: 'Priya' } });
    expect(goodInputResponse.json()).toEqual({ name: 'Priya' });
    await app.close();
  });

  it('hides our own bugs behind a reference id', async () => {
    const boomModule = defineModule({
      id: 'core.boom',
      kind: 'core',
      routes: (app) => {
        app.get('/boom', { config: { access: 'public' } }, async () => {
          throw new Error('secret internal detail');
        });
      },
    });
    const app = await buildTestApp(database, [boomModule], { publicRoutes: [{ method: 'GET', path: '/api/v1/boom', reason: 'test' }, { method: 'GET', path: '/api/v1/health', reason: 'test' }] });
    const response = await app.inject('/api/v1/boom');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret internal detail');
    expect(response.json().error.request).toBe(response.headers['x-request-id']);
    await app.close();
  });

  it('limits how often one address can call', async () => {
    const app = await buildTestApp(database, [], { rateLimit: { max: 3, timeWindow: '1 minute' } });
    const statusCodes = [];
    for (let attemptNumber = 0; attemptNumber < 5; attemptNumber++) statusCodes.push((await app.inject('/api/v1/health')).statusCode);
    expect(statusCodes).toEqual([200, 200, 200, 429, 429]);
    expect((await app.inject('/api/v1/health')).json().error.code).toBe('TOO_MANY_REQUESTS');
    await app.close();
  });
});

describe('route rules', () => {
  it('refuses to start when a route does not say who may call it', async () => {
    const routeWithoutAccessModule = defineModule({ id: 'core.lazy', kind: 'core', routes: (app) => void app.get('/lazy', async () => 'hi') });
    await expect(buildTestApp(database, [routeWithoutAccessModule])).rejects.toThrow(/has no config\.access/);
  });

  it('refuses to start when a public route is not on the public list', async () => {
    const unlistedPublicRouteModule = defineModule({ id: 'core.sneaky', kind: 'core', routes: (app) => void app.get('/sneaky', { config: { access: 'public' } }, async () => 'hi') });
    await expect(buildTestApp(database, [unlistedPublicRouteModule])).rejects.toThrow(/not listed in kernel\/http\/public-routes\.ts/);
  });

  it('answers 401 to staff and manager routes while nobody can sign in', async () => {
    const staffOnlyModule = defineModule({
      id: 'core.secret',
      kind: 'core',
      routes: (app) => {
        app.get('/staff-only', { config: { access: 'staff' } }, async () => 'ok');
      },
    });
    const app = await buildTestApp(database, [staffOnlyModule]);
    const response = await app.inject('/api/v1/staff-only');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });

  it('checks the role: a staff member is refused a manager route', async () => {
    const accountId = newAccountId();
    const rolesModule = defineModule({
      id: 'core.roles',
      kind: 'core',
      routes: (app) => {
        app.get('/for-staff', { config: { access: 'staff' } }, async (request) => ({ role: request.principal?.role }));
        app.get('/for-managers', { config: { access: 'manager' } }, async () => 'ok');
      },
    });
    const authenticateAs = (role: Principal['role']) => async () => ({ accountId, userId: newAccountId(), role });
    const staffApp = await buildTestApp(database, [rolesModule], { authenticate: authenticateAs('staff') });
    expect((await staffApp.inject('/api/v1/for-staff')).json()).toEqual({ role: 'staff' });
    const denied = await staffApp.inject('/api/v1/for-managers');
    expect(denied.statusCode).toBe(403);
    await staffApp.close();
    const managerApp = await buildTestApp(database, [rolesModule], { authenticate: authenticateAs('manager') });
    expect((await managerApp.inject('/api/v1/for-managers')).statusCode).toBe(200);
    await managerApp.close();
  });

  it("answers 404 for a module that is off for the business, and works when it is on", async () => {
    const accountId = newAccountId();
    const leadsModule = defineModule({
      id: 'engine.leads',
      kind: 'engine',
      routes: (app) => void app.get('/leads', { config: { access: 'staff' } }, async () => ({ leads: [] })),
    });
    const authenticate = async () => ({ accountId, userId: accountId, role: 'manager' as const });
    const appWithModuleOff = await buildTestApp(database, [leadsModule], { authenticate });
    const response = await appWithModuleOff.inject('/api/v1/leads');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    await appWithModuleOff.close();
    const registry = createRegistry([...modules, leadsModule]);
    const appWithModuleOn = await buildTestApp(database, [leadsModule], { authenticate, gate: { isActive: async (checkedAccountId, moduleId) => moduleId === 'engine.leads' || coreOnlyGate(registry).isActive(checkedAccountId, moduleId) } });
    expect((await appWithModuleOn.inject('/api/v1/leads')).json()).toEqual({ leads: [] });
    await appWithModuleOn.close();
  });
});

describe('logs', () => {
  it('never record the query string, credentials or the body', async () => {
    const { logger, text } = captureLogs();
    const echoModule = defineModule({
      id: 'core.echo2',
      kind: 'core',
      routes: (app) => {
        app.post('/echo2', { config: { access: 'public' }, schema: { body: z.object({ phone: z.string() }) } }, async () => 'ok');
      },
    });
    const app = await buildTestApp(database, [echoModule], { logger, publicRoutes: [{ method: 'POST', path: '/api/v1/echo2', reason: 'test' }, { method: 'GET', path: '/api/v1/health', reason: 'test' }] });
    await app.inject({ method: 'POST', url: '/api/v1/echo2?code=482913', headers: { authorization: 'Bearer top-secret-token', cookie: 'session=abc123secret' }, payload: { phone: '+919847012345' } });
    await app.close();
    const loggedText = text();
    expect(loggedText).toContain('/api/v1/echo2');
    for (const sensitiveValue of ['482913', 'top-secret-token', 'abc123secret', '9847012345']) expect(loggedText).not.toContain(sensitiveValue);
  });
});
