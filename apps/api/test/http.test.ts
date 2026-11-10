import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Principal } from '../src/kernel/http/guard';
import { PUBLIC_ROUTES } from '../src/kernel/http/public-routes';
import { defineModule } from '../src/kernel/modules/define';
import { coreOnlyGate, createRegistry } from '../src/kernel/modules/registry';
import { buildTestApp, captureLogs, TEST_WEB_ORIGIN, testConfig, unsafeRequestHeaders } from './support/app';
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
    const app = await buildApp({
      config: testConfig(),
      database: databaseThatIsDown,
      registry: createRegistry(modules),
    });
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
      routes: (moduleApp) => {
        moduleApp.post(
          '/echo',
          { config: { access: 'public' }, schema: { body: z.object({ name: z.string().min(2).max(20) }) } },
          async (request) => request.body,
        );
      },
    });
    const app = await buildTestApp(database, [echoModule], {
      publicRoutes: [
        ...PUBLIC_ROUTES,
        { method: 'POST', path: '/api/v1/echo', reason: 'test' },
        { method: 'GET', path: '/api/v1/health', reason: 'test' },
      ],
    });
    const badInputResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/echo',
      headers: unsafeRequestHeaders,
      payload: { name: 'x' },
    });
    expect(badInputResponse.statusCode).toBe(400);
    expect(badInputResponse.json().error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ path: 'name' }] });
    const brokenJsonResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/echo',
      headers: { ...unsafeRequestHeaders, 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(brokenJsonResponse.statusCode).toBe(400);
    expect(brokenJsonResponse.json().error.code).toBe('BAD_JSON');
    const goodInputResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/echo',
      headers: unsafeRequestHeaders,
      payload: { name: 'Priya' },
    });
    expect(goodInputResponse.json()).toEqual({ name: 'Priya' });
    await app.close();
  });

  it('hides our own bugs behind a reference id', async () => {
    const boomModule = defineModule({
      id: 'core.boom',
      kind: 'core',
      routes: (moduleApp) => {
        moduleApp.get('/boom', { config: { access: 'public' } }, async () => {
          throw new Error('secret internal detail');
        });
      },
    });
    const app = await buildTestApp(database, [boomModule], {
      publicRoutes: [
        ...PUBLIC_ROUTES,
        { method: 'GET', path: '/api/v1/boom', reason: 'test' },
        { method: 'GET', path: '/api/v1/health', reason: 'test' },
      ],
    });
    const response = await app.inject('/api/v1/boom');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret internal detail');
    expect(response.json().error.request).toBe(response.headers['x-request-id']);
    await app.close();
  });

  it('limits how often one address can call', async () => {
    const app = await buildTestApp(database, [], { rateLimit: { max: 3, timeWindow: '1 minute' } });
    const statusCodes = [];
    for (let attemptNumber = 0; attemptNumber < 5; attemptNumber++)
      statusCodes.push((await app.inject('/api/v1/health')).statusCode);
    expect(statusCodes).toEqual([200, 200, 200, 429, 429]);
    expect((await app.inject('/api/v1/health')).json().error.code).toBe('TOO_MANY_REQUESTS');
    await app.close();
  });
});

describe('route rules', () => {
  it('refuses to start when a route does not say who may call it', async () => {
    const routeWithoutAccessModule = defineModule({
      id: 'core.lazy',
      kind: 'core',
      routes: (app) => void app.get('/lazy', async () => 'hi'),
    });
    await expect(buildTestApp(database, [routeWithoutAccessModule])).rejects.toThrow(/has no config\.access/);
  });

  it('refuses to start when a public route is not on the public list', async () => {
    const unlistedPublicRouteModule = defineModule({
      id: 'core.sneaky',
      kind: 'core',
      routes: (app) => void app.get('/sneaky', { config: { access: 'public' } }, async () => 'hi'),
    });
    await expect(buildTestApp(database, [unlistedPublicRouteModule])).rejects.toThrow(
      /not listed in kernel\/http\/public-routes\.ts/,
    );
  });

  it('answers 401 to staff and manager routes while nobody can sign in', async () => {
    const staffOnlyModule = defineModule({
      id: 'core.secret',
      kind: 'core',
      routes: (moduleApp) => {
        moduleApp.get('/staff-only', { config: { access: 'staff' } }, async () => 'ok');
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
      routes: (moduleApp) => {
        moduleApp.get('/for-staff', { config: { access: 'staff' } }, async (request) => ({
          role: request.principal?.role,
        }));
        moduleApp.get('/for-managers', { config: { access: 'manager' } }, async () => 'ok');
      },
    });
    const authenticateAs = (role: Principal['role']) => async () => ({
      accountId,
      userId: newAccountId(),
      role,
      sessionId: newAccountId(),
      emailVerified: true,
    });
    const staffApp = await buildTestApp(database, [rolesModule], { authenticate: authenticateAs('staff') });
    expect((await staffApp.inject('/api/v1/for-staff')).json()).toEqual({ role: 'staff' });
    const denied = await staffApp.inject('/api/v1/for-managers');
    expect(denied.statusCode).toBe(403);
    await staffApp.close();
    const managerApp = await buildTestApp(database, [rolesModule], { authenticate: authenticateAs('manager') });
    expect((await managerApp.inject('/api/v1/for-managers')).statusCode).toBe(200);
    await managerApp.close();
  });

  it('answers 404 for a module that is off for the business, and works when it is on', async () => {
    const accountId = newAccountId();
    const leadsModule = defineModule({
      id: 'engine.leads',
      kind: 'engine',
      routes: (app) => void app.get('/leads', { config: { access: 'staff' } }, async () => ({ leads: [] })),
    });
    const authenticate = async () => ({
      accountId,
      userId: accountId,
      role: 'manager' as const,
      sessionId: accountId,
      emailVerified: true,
    });
    const appWithModuleOff = await buildTestApp(database, [leadsModule], { authenticate });
    const response = await appWithModuleOff.inject('/api/v1/leads');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    await appWithModuleOff.close();
    const registry = createRegistry([...modules, leadsModule]);
    const appWithModuleOn = await buildTestApp(database, [leadsModule], {
      authenticate,
      gate: {
        isActive: async (checkedAccountId, moduleId) =>
          moduleId === 'engine.leads' || coreOnlyGate(registry).isActive(checkedAccountId, moduleId),
      },
    });
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
      routes: (moduleApp) => {
        moduleApp.post(
          '/echo2',
          { config: { access: 'public' }, schema: { body: z.object({ phone: z.string() }) } },
          async () => 'ok',
        );
      },
    });
    const app = await buildTestApp(database, [echoModule], {
      logger,
      publicRoutes: [
        ...PUBLIC_ROUTES,
        { method: 'POST', path: '/api/v1/echo2', reason: 'test' },
        { method: 'GET', path: '/api/v1/health', reason: 'test' },
      ],
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/echo2?code=482913',
      headers: { ...unsafeRequestHeaders, authorization: 'Bearer top-secret-token', cookie: 'session=abc123secret' },
      payload: { phone: '+919847012345' },
    });
    await app.close();
    const loggedText = text();
    expect(loggedText).toContain('/api/v1/echo2');
    for (const sensitiveValue of ['482913', 'top-secret-token', 'abc123secret', '9847012345'])
      expect(loggedText).not.toContain(sensitiveValue);
  });
});

describe('CSRF protection', () => {
  const buildAppWithEchoRoute = async () => {
    const echoModule = defineModule({
      id: 'core.echo',
      kind: 'core',
      routes: (moduleApp) => {
        moduleApp.post('/echo', { config: { access: 'public' } }, async () => ({ ok: true }));
        moduleApp.get('/echo', { config: { access: 'public' } }, async () => ({ ok: true }));
      },
    });
    return buildTestApp(database, [echoModule], {
      publicRoutes: [
        ...PUBLIC_ROUTES,
        { method: 'POST', path: '/api/v1/echo', reason: 'test' },
        { method: 'GET', path: '/api/v1/echo', reason: 'test' },
        { method: 'GET', path: '/api/v1/health', reason: 'test' },
      ],
    });
  };

  it('refuses a change that has no Origin, a foreign Origin, or no custom header, and accepts one with both', async () => {
    const app = await buildAppWithEchoRoute();
    const attempts = [
      { headers: {} },
      { headers: { origin: TEST_WEB_ORIGIN } },
      { headers: { 'x-requested-with': 'toobler-web' } },
      { headers: { origin: 'https://evil.example', 'x-requested-with': 'toobler-web' } },
      { headers: { origin: TEST_WEB_ORIGIN, 'x-requested-with': 'XMLHttpRequest' } },
    ];
    for (const attempt of attempts) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/echo', ...attempt });
      expect(response.statusCode, JSON.stringify(attempt)).toBe(403);
      expect(response.json().error.code).toBe('CSRF_REJECTED');
    }
    const accepted = await app.inject({ method: 'POST', url: '/api/v1/echo', headers: unsafeRequestHeaders });
    expect(accepted.statusCode).toBe(200);
    await app.close();
  });

  it('leaves plain reads alone', async () => {
    const app = await buildAppWithEchoRoute();
    expect((await app.inject('/api/v1/echo')).statusCode).toBe(200);
    await app.close();
  });
});

describe('email verification is enforced by the server', () => {
  const accountId = newAccountId();
  const probeModule = defineModule({
    id: 'core.probe',
    kind: 'core',
    routes: (moduleApp) => {
      moduleApp.get('/normal', { config: { access: 'staff' } }, async () => ({ ok: true }));
      moduleApp.get('/for-unverified', { config: { access: 'staff', allowUnverified: true } }, async (request) => ({
        accountId: request.requestContext?.accountId,
        actor: request.requestContext?.actor,
        userRole: request.requestContext?.user.role,
      }));
    },
  });
  const authenticateWith = (emailVerified: boolean) => async () => ({
    accountId,
    userId: newAccountId(),
    role: 'manager' as const,
    sessionId: newAccountId(),
    emailVerified,
  });

  it('refuses a person with an unverified email on every route that does not opt in', async () => {
    const app = await buildTestApp(database, [probeModule], { authenticate: authenticateWith(false) });
    const refused = await app.inject('/api/v1/normal');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await app.inject('/api/v1/for-unverified')).statusCode).toBe(200);
    await app.close();
  });

  it('lets a verified person in, and gives routes a request context for their business', async () => {
    const app = await buildTestApp(database, [probeModule], { authenticate: authenticateWith(true) });
    expect((await app.inject('/api/v1/normal')).statusCode).toBe(200);
    const response = await app.inject('/api/v1/for-unverified');
    expect(response.json()).toMatchObject({ accountId, actor: { kind: 'user' }, userRole: 'manager' });
    await app.close();
  });
});
