import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, testConfig } from './support/app';
import { openTestDatabase } from './support/harness';

const DOCS_ORIGIN = 'http://localhost:4000';
const WEB_ORIGIN = 'http://localhost:3000';

let database: Database;
let developmentApp: FastifyInstance;
let testApp: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  // The same app as in development: the docs page is on and its address is allowed to change data
  developmentApp = await buildTestApp(database, [], {
    config: { ...testConfig(), env: 'development', docsOrigin: DOCS_ORIGIN },
  });
  // The app as tests and production build it: no docs page
  testApp = await buildTestApp(database);
});
afterAll(async () => {
  await developmentApp.close();
  await testApp.close();
  await database.close();
});

/** The OpenAPI document the development app serves. */
async function readDocument() {
  const response = await developmentApp.inject({ url: '/docs/json' });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

describe('the API docs page (development only)', () => {
  it('serves the page and the OpenAPI document without signing in', async () => {
    const page = await developmentApp.inject({ url: '/docs/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    const document = await readDocument();
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Toobler One API');
    expect(document.servers).toEqual([{ url: DOCS_ORIGIN }]);
  });

  it('lists the routes of every module, grouped by module', async () => {
    const document = await readDocument();
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/industries',
        '/api/v1/auth/login',
        '/api/v1/me',
        '/api/v1/modules',
        '/api/v1/modules/{id}',
        '/api/v1/platform/businesses/{id}/modules',
      ]),
    );
    expect(document.paths['/api/v1/modules/{id}'].patch.tags).toEqual(['core.module_switches']);
    expect(document.paths['/api/v1/auth/login'].post.tags).toEqual(['core.auth']);
    const everyOperation = Object.values(document.paths).flatMap((path) => Object.values(path as object));
    expect(everyOperation.length).toBeGreaterThan(15);
    for (const operation of everyOperation as { tags?: string[] }[]) expect(operation.tags?.length).toBe(1);
  });

  it('describes the request and response shapes from the code', async () => {
    const document = await readDocument();
    const switchModule = document.paths['/api/v1/modules/{id}'].patch;
    expect(switchModule.requestBody.content['application/json'].schema.properties.enabled.type).toBe('boolean');
    expect(
      switchModule.parameters.some(
        (parameter: { name: string; in: string }) => parameter.name === 'id' && parameter.in === 'path',
      ),
    ).toBe(true);
    expect(Object.keys(switchModule.responses)).toContain('200');
  });

  it('says who may call each route', async () => {
    const document = await readDocument();
    expect(document.paths['/api/v1/modules/{id}'].patch.description).toContain('**Who may call it:** manager');
    expect(document.paths['/api/v1/modules'].get.description).toContain('**Who may call it:** staff');
    expect(document.paths['/api/v1/platform/businesses/{id}/modules'].post.description).toContain('platform');
    expect(document.paths['/api/v1/auth/login'].post.description).toContain('public');
  });

  it('pre-fills the header our CSRF check needs on every route that changes something, and only on those', async () => {
    const document = await readDocument();
    const header = (operation: { parameters?: { name: string; in: string; schema?: { default?: string } }[] }) =>
      operation.parameters?.find((parameter) => parameter.name === 'x-requested-with');
    expect(header(document.paths['/api/v1/modules/{id}'].patch)?.in).toBe('header');
    expect(header(document.paths['/api/v1/modules/{id}'].patch)?.schema?.default).toBe('toobler-web');
    expect(header(document.paths['/api/v1/auth/login'].post)?.schema?.default).toBe('toobler-web');
    expect(header(document.paths['/api/v1/modules'].get)).toBeUndefined();
  });

  it('never contains a secret', async () => {
    const response = await developmentApp.inject({ url: '/docs/json' });
    const config = testConfig();
    expect(response.body).not.toContain(config.auth.jwtSecret);
    expect(response.body).not.toContain(config.db.url);
  });
});

describe('what the docs page changes about CSRF', () => {
  /** A sign-in attempt with a wrong password: it either reaches the sign-in rules (401) or is stopped by CSRF (403). */
  const trySignIn = (app: FastifyInstance, headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { email: 'nobody@example.com', password: 'not-a-real-password' },
    });

  it('in development a change from the docs page is accepted (it reaches the sign-in rules)', async () => {
    const response = await trySignIn(developmentApp, { origin: DOCS_ORIGIN, 'x-requested-with': 'toobler-web' });
    expect(response.statusCode).toBe(401);
  });

  it('in development the web app is still accepted, and another website is still refused', async () => {
    expect(
      (await trySignIn(developmentApp, { origin: WEB_ORIGIN, 'x-requested-with': 'toobler-web' })).statusCode,
    ).toBe(401);
    const stranger = await trySignIn(developmentApp, {
      origin: 'https://evil.example.com',
      'x-requested-with': 'toobler-web',
    });
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json().error.code).toBe('CSRF_REJECTED');
  });

  it('in development the docs page still needs the header', async () => {
    expect((await trySignIn(developmentApp, { origin: DOCS_ORIGIN })).json().error.code).toBe('CSRF_REJECTED');
  });

  it('outside development the docs address does not exist (404)', async () => {
    expect((await testApp.inject({ url: '/docs/' })).statusCode).toBe(404);
    expect((await testApp.inject({ url: '/docs/json' })).statusCode).toBe(404);
    expect((await testApp.inject({ url: '/docs' })).statusCode).toBe(404);
  });

  it('outside development a change from the docs origin is refused', async () => {
    const response = await trySignIn(testApp, { origin: DOCS_ORIGIN, 'x-requested-with': 'toobler-web' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF_REJECTED');
    expect((await trySignIn(testApp, { origin: WEB_ORIGIN, 'x-requested-with': 'toobler-web' })).statusCode).toBe(401);
  });
});
