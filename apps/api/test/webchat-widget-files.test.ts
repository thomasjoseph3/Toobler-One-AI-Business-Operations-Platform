import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

const SITE = 'https://nairstays.example';

let database: Database;
let app: FastifyInstance;
let appInProduction: FastifyInstance;
let appWithoutBuild: FastifyInstance;
let filesDirectory: string;

beforeAll(async () => {
  database = openTestDatabase();
  // A small pretend build of the widget, so the test does not depend on `npm run build:widget` having been run
  filesDirectory = mkdtempSync(path.join(tmpdir(), 'widget-files-'));
  mkdirSync(path.join(filesDirectory, 'assets'));
  writeFileSync(path.join(filesDirectory, 'loader.js'), '// the loader');
  writeFileSync(path.join(filesDirectory, 'chat.html'), '<!doctype html><title>Chat</title>');
  writeFileSync(path.join(filesDirectory, 'assets', 'chat-abc123.js'), 'console.log("chat")');
  writeFileSync(path.join(filesDirectory, 'assets', 'style-abc123.css'), 'body{}');
  writeFileSync(path.join(filesDirectory, 'assets', 'notes.txt'), 'not a web file');
  writeFileSync(path.join(filesDirectory, '.env'), 'SECRET=1');
  const config = {
    ...testConfig(),
    widgetFilesDirectory: filesDirectory,
    ai: { platformKeys: { gemini: [`widget-files-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  const llmProvider = createScriptedLlmProvider(() => ({ answer: 'Hello from the agent' }));
  app = await buildTestApp(database, [], { config, llmProvider });
  appInProduction = await buildTestApp(database, [], { config: { ...config, env: 'production' }, llmProvider });
  appWithoutBuild = await buildTestApp(database, [], {
    config: { ...config, widgetFilesDirectory: path.join(filesDirectory, 'nothing-here') },
    llmProvider,
  });
});
afterAll(async () => {
  await app.close();
  await appInProduction.close();
  await appWithoutBuild.close();
  await database.close();
  rmSync(filesDirectory, { recursive: true, force: true });
});

const asStaff = (person: SignedInPerson, method: 'GET' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function newBusinessWithChat(allowedWebsites: string[] = [SITE]) {
  const person = await createSignedInPerson(app, database);
  await database.system
    .insertInto('ai_settings')
    .values({
      account_id: person.profile.business.id,
      key_mode: 'platform',
      platform_enabled: true,
      platform_expires_at: null,
      task_models: {},
    })
    .execute();
  await asStaff(person, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
  const settings = await asStaff(person, 'PATCH', '/channels/webchat', { allowedWebsites });
  return { person, accountId: person.profile.business.id, key: settings.json().widgetKey as string };
}

describe('GET /widget/loader.js', () => {
  it('serves the loader to any website, kept for five minutes', async () => {
    const response = await app.inject({ method: 'GET', url: '/widget/loader.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('// the loader');
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['cache-control']).toBe('public, max-age=300');
  });

  it('answers 404 when the widget has not been built', async () => {
    expect((await appWithoutBuild.inject({ method: 'GET', url: '/widget/loader.js' })).statusCode).toBe(404);
  });
});

describe('GET /widget/assets/{file}', () => {
  it('serves the built script and styles, kept for a year', async () => {
    const script = await app.inject({ method: 'GET', url: '/widget/assets/chat-abc123.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('text/javascript');
    expect(script.headers['cache-control']).toContain('immutable');
    const styles = await app.inject({ method: 'GET', url: '/widget/assets/style-abc123.css' });
    expect(styles.headers['content-type']).toContain('text/css');
  });

  it('serves nothing else: no path out of the folder, no hidden file, no unknown file type, no file that is not there', async () => {
    for (const file of ['..', '.env', '%2e%2e%2f.env', '..%2f.env', 'notes.txt', 'missing.js', '..%5Cloader.js']) {
      const response = await app.inject({ method: 'GET', url: `/widget/assets/${file}` });
      expect(response.statusCode, file).toBe(404);
      expect(response.body).not.toContain('SECRET');
    }
    expect((await app.inject({ method: 'GET', url: '/widget/assets/../.env' })).statusCode).toBe(404);
  });
});

describe('GET /widget/chat', () => {
  it('serves the chat window to a frame, and lets only the business’s own websites frame it', async () => {
    const { key } = await newBusinessWithChat([SITE, 'https://nairstays.example:8443']);
    const response = await app.inject({
      method: 'GET',
      url: `/widget/chat?key=${key}`,
      headers: { 'sec-fetch-dest': 'iframe' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain('<title>Chat</title>');
    const policy = String(response.headers['content-security-policy']);
    expect(policy).toContain('frame-ancestors https://nairstays.example https://nairstays.example:8443');
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
    expect(response.headers['x-frame-options']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('is served to a browser that does not say what it is for, and refused when opened on its own', async () => {
    const { key } = await newBusinessWithChat();
    expect((await app.inject({ method: 'GET', url: `/widget/chat?key=${key}` })).statusCode).toBe(200);
    const onItsOwn = await app.inject({
      method: 'GET',
      url: `/widget/chat?key=${key}`,
      headers: { 'sec-fetch-dest': 'document' },
    });
    expect(onItsOwn.statusCode).toBe(404);
  });

  it('answers 404 for an unknown key, a business with no allowed website, and a switched-off chat; 400 for a key of the wrong shape', async () => {
    const framed = { 'sec-fetch-dest': 'iframe' };
    expect(
      (await app.inject({ method: 'GET', url: `/widget/chat?key=wk_${'z'.repeat(32)}`, headers: framed })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/widget/chat?key=nonsense', headers: framed })).statusCode).toBe(
      400,
    );
    const nowhere = await newBusinessWithChat([]);
    expect(
      (await app.inject({ method: 'GET', url: `/widget/chat?key=${nowhere.key}`, headers: framed })).statusCode,
    ).toBe(404);
    const switchedOff = await newBusinessWithChat();
    await asStaff(switchedOff.person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    expect(
      (await app.inject({ method: 'GET', url: `/widget/chat?key=${switchedOff.key}`, headers: framed })).statusCode,
    ).toBe(404);
  });

  it('leaves every other page unframeable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(String(response.headers['content-security-policy'])).toContain("frame-ancestors 'self'");
  });
});

describe('GET /widget/test (development only)', () => {
  it('shows a page with the pasted line for the key', async () => {
    const { key } = await newBusinessWithChat();
    const response = await app.inject({ method: 'GET', url: `/widget/test?key=${key}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`<script src="/widget/loader.js" data-key="${key}" async></script>`);
  });

  it('puts only a key of the right shape into the page, so nothing typed into the address can become code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/widget/test?key=${encodeURIComponent('"><script>alert(1)</script>')}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('alert(1)');
  });

  it('does not exist in production', async () => {
    expect((await appInProduction.inject({ method: 'GET', url: '/widget/test' })).statusCode).toBe(404);
  });
});

describe('calls from the chat window itself (same address as the API)', () => {
  const fromChatWindow = { 'sec-fetch-site': 'same-origin' };

  it('are accepted while the business has listed a website, and need no permission headers', async () => {
    const { person, key } = await newBusinessWithChat();
    const config = await app.inject({
      method: 'GET',
      url: `/api/v1/public/widget/${key}/config`,
      headers: fromChatWindow,
    });
    expect(config.statusCode, config.body).toBe(200);
    expect(config.headers['access-control-allow-origin']).toBeUndefined();
    // They do not count as "last seen on a website"
    expect((await asStaff(person, 'GET', '/channels/webchat')).json().lastSeen).toBeNull();

    // A real browser sends the API's own address as the Origin of a same-site POST
    const message = await app.inject({
      method: 'POST',
      url: `/api/v1/public/widget/${key}/messages`,
      headers: { ...fromChatWindow, origin: testConfig().publicBaseUrl },
      payload: { message: 'Hello from the window' },
    });
    expect(message.statusCode, message.body).toBe(200);
    expect(message.json().reply).toBe('Hello from the agent');
  });

  it('are refused while the business has listed no website', async () => {
    const { key } = await newBusinessWithChat([]);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/public/widget/${key}/config`,
      headers: fromChatWindow,
    });
    expect(response.statusCode).toBe(403);
  });

  it('are refused when the browser says the call came from another site (or does not say)', async () => {
    const { key } = await newBusinessWithChat();
    for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, {}]) {
      const response = await app.inject({ method: 'GET', url: `/api/v1/public/widget/${key}/config`, headers });
      expect(response.statusCode, JSON.stringify(headers)).toBe(403);
    }
  });
});
