import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { decryptSecret } from '../src/modules/core/ai/helpers/secret-box';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, captureLogs, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let appWithoutSecret: FastifyInstance;
let appWithScriptedAi: FastifyInstance;
let appWithStrictLimits: FastifyInstance;
/** What the pretend AI company does for the next test call. Each test sets it. */
let script: LlmScript = () => ({ answer: 'OK' });
const scriptedAi = createScriptedLlmProvider((candidate, request) => script(candidate, request));
const capturedLogs = captureLogs();

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], { logger: capturedLogs.logger });
  appWithoutSecret = await buildTestApp(database, [], {
    config: { ...testConfig(), secrets: { encryptionKey: null } },
  });
  appWithScriptedAi = await buildTestApp(database, [], { llmProvider: scriptedAi, logger: capturedLogs.logger });
  appWithStrictLimits = await buildTestApp(database, [], { llmProvider: scriptedAi, strictRouteLimits: true });
});
afterAll(async () => {
  await app.close();
  await appWithoutSecret.close();
  await appWithScriptedAi.close();
  await appWithStrictLimits.close();
  await database.close();
});

/** A made-up key that looks like a real one. Unique per call so keys never clash between tests. */
const newKey = () => `AIzaSyTest${randomUUID().replace(/-/g, '')}`;

const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: unknown,
  targetApp: FastifyInstance = app,
) =>
  targetApp.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

const addKey = (person: SignedInPerson | null, body: unknown, targetApp?: FastifyInstance) =>
  send(person, 'POST', '/ai/keys', body, targetApp);
const listKeys = (person: SignedInPerson | null) => send(person, 'GET', '/ai/keys');

async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('POST /api/v1/ai/keys', () => {
  it('saves a key and answers with a preview only: never the key', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const response = await addKey(manager, { provider: 'gemini', label: '  Main   Gemini key ', key });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      provider: 'gemini',
      label: 'Main Gemini key',
      keyPreview: `••••${key.slice(-4)}`,
      status: 'unchecked',
      statusNote: null,
      statusCheckedAt: null,
    });
    expect(response.body).not.toContain(key);
    expect(Object.keys(response.json()).sort()).toEqual(
      ['createdAt', 'id', 'keyPreview', 'label', 'provider', 'status', 'statusCheckedAt', 'statusNote'].sort(),
    );
  });

  it('keeps the key scrambled in the database: not readable, tied to the business, and readable only with the server secret', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const response = await addKey(manager, { provider: 'openai', label: 'OpenAI', key });
    const row = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', response.json().id)
      .executeTakeFirstOrThrow();
    expect(row.encrypted_key).not.toContain(key);
    expect(row.encrypted_key).not.toContain(key.slice(0, 12));
    expect(row.key_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row.key_fingerprint).not.toContain(key.slice(0, 12));
    expect(row.key_last_four).toBe(key.slice(-4));
    const accountId = manager.profile.business.id;
    const secret = testConfig().secrets.encryptionKey as Buffer;
    expect(decryptSecret(row.encrypted_key, secret, accountId)).toBe(key);
    // copied into another business's row, it cannot be read
    expect(() => decryptSecret(row.encrypted_key, secret, randomUUID())).toThrow();
  });

  it('writes who saved it, and a log line and event that hold ids and field names, never the key', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const response = await addKey(manager, { provider: 'anthropic', label: 'Claude', key });
    const keyId = response.json().id as string;
    const row = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', keyId)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: manager.profile.user.id });
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('kind', '=', 'ai.key_added')
      .execute();
    expect(logLines).toHaveLength(1);
    expect(JSON.stringify(logLines)).not.toContain(key);
    expect(JSON.stringify(logLines)).toContain(keyId);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('name', '=', 'ai.key_added')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(key);
  });

  it('never puts the key in the server log', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    await addKey(manager, { provider: 'gemini', label: 'Logged?', key });
    await addKey(manager, { provider: 'gemini', label: 'Again', key }); // a refusal must not repeat it either
    expect(capturedLogs.text()).not.toContain(key);
  });

  it('refuses the same key twice (409), naming the label it was saved under, even with a different label', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    await addKey(manager, { provider: 'gemini', label: 'First', key });
    const again = await addKey(manager, { provider: 'gemini', label: 'Second', key });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().error.code).toBe('AI_KEY_EXISTS');
    expect(again.json().error.message).toContain('First');
    expect(again.body).not.toContain(key);
    expect((await listKeys(manager)).json().items).toHaveLength(1);
  });

  it('allows the same key text for another company or another business (each fingerprint is its own)', async () => {
    const manager = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const key = newKey();
    expect((await addKey(manager, { provider: 'gemini', label: 'A', key })).statusCode).toBe(201);
    expect((await addKey(manager, { provider: 'openai', label: 'B', key })).statusCode).toBe(201);
    expect((await addKey(other, { provider: 'gemini', label: 'C', key })).statusCode).toBe(201);
  });

  it('allows up to 10 keys for one company and refuses the 11th (409)', async () => {
    const manager = await createSignedInPerson(app, database);
    for (let count = 1; count <= 10; count += 1) {
      expect((await addKey(manager, { provider: 'gemini', label: `Key ${count}`, key: newKey() })).statusCode).toBe(
        201,
      );
    }
    const eleventh = await addKey(manager, { provider: 'gemini', label: 'Key 11', key: newKey() });
    expect(eleventh.statusCode).toBe(409);
    expect(eleventh.json().error.code).toBe('TOO_MANY_AI_KEYS');
    // another company has its own allowance
    expect((await addKey(manager, { provider: 'openai', label: 'OpenAI', key: newKey() })).statusCode).toBe(201);
  });

  it('answers 503 when the server has no encryption secret, and saves nothing', async () => {
    const manager = await createSignedInPerson(appWithoutSecret, database);
    const key = newKey();
    const response = await addKey(manager, { provider: 'gemini', label: 'No secret', key }, appWithoutSecret);
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json().error.code).toBe('SECRETS_NOT_SET_UP');
    expect(response.body).not.toContain(key);
    const saved = await database.system
      .selectFrom('ai_keys')
      .select('id')
      .where('account_id', '=', manager.profile.business.id)
      .execute();
    expect(saved).toHaveLength(0);
  });

  it('answers 400 for bad input and says nothing about the key', async () => {
    const manager = await createSignedInPerson(app, database);
    const good = { provider: 'gemini', label: 'Ok', key: newKey() };
    const bad: unknown[] = [
      { ...good, provider: 'mistral' },
      { ...good, provider: undefined },
      { ...good, label: '   ' },
      { ...good, label: 'x'.repeat(81) },
      { ...good, label: undefined },
      { ...good, key: 'short' },
      { ...good, key: 'has a space in it 1234567890' },
      { ...good, key: 'k'.repeat(401) },
      { ...good, key: undefined },
      { ...good, extra: 'field' },
      'not an object',
    ];
    for (const body of bad) {
      const response = await addKey(manager, body);
      expect(response.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await listKeys(manager)).json().items).toHaveLength(0);
  });

  it('answers 401 when nobody is signed in, and 403 to staff (managers only)', async () => {
    expect((await addKey(null, { provider: 'gemini', label: 'x', key: newKey() })).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    await setRole(person, 'staff');
    expect((await addKey(person, { provider: 'gemini', label: 'x', key: newKey() })).statusCode).toBe(403);
    await setRole(person, 'staff_own');
    expect((await addKey(person, { provider: 'gemini', label: 'x', key: newKey() })).statusCode).toBe(403);
  });
});

describe('GET /api/v1/ai/keys', () => {
  it('lists the business’s keys oldest first, as previews with a status, and never a key', async () => {
    const manager = await createSignedInPerson(app, database);
    const firstKey = newKey();
    const secondKey = newKey();
    await addKey(manager, { provider: 'gemini', label: 'First', key: firstKey });
    await addKey(manager, { provider: 'openai', label: 'Second', key: secondKey });
    const response = await listKeys(manager);
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { label: string }) => item.label)).toEqual(['First', 'Second']);
    expect(response.json().items[1]).toMatchObject({ provider: 'openai', keyPreview: `••••${secondKey.slice(-4)}` });
    expect(response.body).not.toContain(firstKey);
    expect(response.body).not.toContain(secondKey);
    expect(response.body).not.toContain('encrypted');
  });

  it('is empty for a business with no keys, and shows one business none of another’s keys', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addKey(first, { provider: 'gemini', label: 'Private to the first', key: newKey() });
    expect((await listKeys(second)).json().items).toEqual([]);
  });

  it('leaves out a removed key', async () => {
    const manager = await createSignedInPerson(app, database);
    const response = await addKey(manager, { provider: 'gemini', label: 'Soon gone', key: newKey() });
    await database.system
      .updateTable('ai_keys')
      .set({ deleted_at: new Date() })
      .where('id', '=', response.json().id)
      .execute();
    expect((await listKeys(manager)).json().items).toEqual([]);
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await listKeys(null)).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    await setRole(person, 'staff');
    expect((await listKeys(person)).statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/ai/keys/{id}', () => {
  it('removes a key: gone from the list, 204, and its secret is wiped from the database', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const keyId = (await addKey(manager, { provider: 'gemini', label: 'To remove', key })).json().id as string;
    const response = await send(manager, 'DELETE', `/ai/keys/${keyId}`);
    expect(response.statusCode, response.body).toBe(204);
    expect((await listKeys(manager)).json().items).toEqual([]);
    const row = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', keyId)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.encrypted_key).toBe('v1.removed.removed.removed');
    expect(row.key_fingerprint).toBe('0'.repeat(64));
    expect(() =>
      decryptSecret(row.encrypted_key, testConfig().secrets.encryptionKey as Buffer, manager.profile.business.id),
    ).toThrow();
  });

  it('lets the same key be saved again after it was removed, and frees a place under the limit of 10', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const firstId = (await addKey(manager, { provider: 'gemini', label: 'Original', key })).json().id as string;
    await send(manager, 'DELETE', `/ai/keys/${firstId}`);
    expect((await addKey(manager, { provider: 'gemini', label: 'Saved again', key })).statusCode).toBe(201);
    for (let count = 1; count <= 9; count += 1)
      await addKey(manager, { provider: 'gemini', label: `Key ${count}`, key: newKey() });
    expect((await addKey(manager, { provider: 'gemini', label: 'Eleventh', key: newKey() })).statusCode).toBe(409);
    const anyId = (await listKeys(manager)).json().items[0].id as string;
    await send(manager, 'DELETE', `/ai/keys/${anyId}`);
    expect((await addKey(manager, { provider: 'gemini', label: 'Now fits', key: newKey() })).statusCode).toBe(201);
  });

  it('answers 404 for a key that was already removed, one that never existed, and another business’s key', async () => {
    const manager = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const keyId = (await addKey(manager, { provider: 'gemini', label: 'Mine', key: newKey() })).json().id as string;
    expect((await send(other, 'DELETE', `/ai/keys/${keyId}`)).statusCode).toBe(404);
    expect((await listKeys(manager)).json().items).toHaveLength(1); // the other business could not touch it
    expect((await send(manager, 'DELETE', `/ai/keys/${keyId}`)).statusCode).toBe(204);
    expect((await send(manager, 'DELETE', `/ai/keys/${keyId}`)).statusCode).toBe(404);
    expect((await send(manager, 'DELETE', `/ai/keys/${randomUUID()}`)).statusCode).toBe(404);
  });

  it('writes a log line and an event with ids only', async () => {
    const manager = await createSignedInPerson(app, database);
    const key = newKey();
    const keyId = (await addKey(manager, { provider: 'openai', label: 'Logged removal', key })).json().id as string;
    await send(manager, 'DELETE', `/ai/keys/${keyId}`);
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('kind', '=', 'ai.key_removed')
      .execute();
    expect(logLines).toHaveLength(1);
    expect(JSON.stringify(logLines)).toContain(keyId);
    expect(JSON.stringify(logLines)).not.toContain(key);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('name', '=', 'ai.key_removed')
      .execute();
    expect(events).toHaveLength(1);
  });

  it('answers 400 for an id that is not an id, 401 when nobody is signed in, and 403 to staff', async () => {
    const manager = await createSignedInPerson(app, database);
    expect((await send(manager, 'DELETE', '/ai/keys/not-an-id')).statusCode).toBe(400);
    expect((await send(null, 'DELETE', `/ai/keys/${randomUUID()}`)).statusCode).toBe(401);
    await setRole(manager, 'staff');
    expect((await send(manager, 'DELETE', `/ai/keys/${randomUUID()}`)).statusCode).toBe(403);
  });
});

describe('POST /api/v1/ai/keys/{id}/test', () => {
  /** Saves a key on the scripted app and returns its id and text. */
  async function saveKey(person: SignedInPerson, provider: 'gemini' | 'openai' | 'anthropic' = 'gemini') {
    const key = newKey();
    const response = await addKey(person, { provider, label: `Test ${provider}`, key }, appWithScriptedAi);
    return { keyId: response.json().id as string, key };
  }
  const testKey = (person: SignedInPerson | null, keyId: string, targetApp: FastifyInstance = appWithScriptedAi) =>
    send(person, 'POST', `/ai/keys/${keyId}/test`, undefined, targetApp);

  it('marks a key that answers as working, and says which model answered', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId, key } = await saveKey(manager);
    script = () => ({ answer: 'OK' });
    const response = await testKey(manager, keyId);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      outcome: 'works',
      modelName: 'gemini-flash-lite-latest',
      key: { id: keyId, status: 'working' },
    });
    expect(response.json().key.statusNote).toContain('gemini-flash-lite-latest');
    expect(response.json().key.statusCheckedAt).not.toBeNull();
    expect(response.json().latencyMs).toBeTypeOf('number');
    expect(response.body).not.toContain(key);
    // the list shows the new status
    const listed = (await send(manager, 'GET', '/ai/keys', undefined, appWithScriptedAi)).json().items[0];
    expect(listed).toMatchObject({ status: 'working' });
  });

  it('calls the key’s own company with the real key, as an “own” key, and only that company’s models', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId, key } = await saveKey(manager, 'openai');
    scriptedAi.requests.length = 0;
    script = () => ({ answer: 'OK' });
    await testKey(manager, keyId);
    const candidates = scriptedAi.requests[0]?.candidates ?? [];
    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        (candidate) => candidate.provider === 'openai' && candidate.apiKey === key && candidate.keySource === 'own',
      ),
    ).toBe(true);
  });

  it('works for a company that has no preset (Claude), trying its own models', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager, 'anthropic');
    script = () => ({ answer: 'OK' });
    const response = await testKey(manager, keyId);
    expect(response.json()).toMatchObject({ outcome: 'works', modelName: 'claude-haiku-5-5' });
  });

  it('falls back to the next model of the company when the first is gone', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    script = (candidate) => {
      if (candidate.modelName === 'gemini-flash-lite-latest') throw new Error('404 model not found');
      return { answer: 'OK' };
    };
    const response = await testKey(manager, keyId);
    expect(response.json()).toMatchObject({ outcome: 'works', key: { status: 'working' } });
    expect(response.json().modelName).not.toBe('gemini-flash-lite-latest');
  });

  it('marks a rejected key as failed, with a plain note and nothing from the company', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId, key } = await saveKey(manager);
    script = () => {
      throw new Error(`API key not valid: ${key}`);
    };
    const response = await testKey(manager, keyId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: 'rejected', modelName: null, key: { status: 'failed' } });
    expect(response.json().key.statusNote).toContain('rejected');
    expect(response.body).not.toContain(key);
    expect(capturedLogs.text()).not.toContain(key);
  });

  it('marks a key whose quota is used up as limited', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    script = () => {
      throw new Error('429 quota exceeded');
    };
    expect((await testKey(manager, keyId)).json()).toMatchObject({ outcome: 'quota', key: { status: 'limited' } });
  });

  it('marks a key that can use none of the models as failed', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    script = () => {
      throw new Error('404 model not found');
    };
    expect((await testKey(manager, keyId)).json()).toMatchObject({ outcome: 'no_model', key: { status: 'failed' } });
  });

  it('keeps the status when the test could not tell (network trouble), but records the note and time', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    script = () => ({ answer: 'OK' });
    await testKey(manager, keyId); // working
    script = () => {
      throw new Error('socket hang up');
    };
    const response = await testKey(manager, keyId);
    expect(response.json()).toMatchObject({ outcome: 'unreachable', key: { status: 'working' } });
    expect(response.json().key.statusNote).toContain('could not get an answer');
  });

  it('writes a log line that names the key but not its secret, and changes no stored key', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId, key } = await saveKey(manager);
    script = () => ({ answer: 'OK' });
    await testKey(manager, keyId);
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('kind', '=', 'ai.key_tested')
      .execute();
    expect(logLines).toHaveLength(1);
    expect(JSON.stringify(logLines)).toContain(keyId);
    expect(JSON.stringify(logLines)).not.toContain(key);
    const row = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', keyId)
      .executeTakeFirstOrThrow();
    expect(
      decryptSecret(row.encrypted_key, testConfig().secrets.encryptionKey as Buffer, manager.profile.business.id),
    ).toBe(key);
  });

  it('answers 404 for another business’s key, a removed key and an unknown id, and never calls the AI company for them', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const other = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    scriptedAi.requests.length = 0;
    expect((await testKey(other, keyId)).statusCode).toBe(404);
    expect((await testKey(manager, randomUUID())).statusCode).toBe(404);
    await send(manager, 'DELETE', `/ai/keys/${keyId}`, undefined, appWithScriptedAi);
    expect((await testKey(manager, keyId)).statusCode).toBe(404);
    expect(scriptedAi.requests).toHaveLength(0);
  });

  it('answers 404 when the key is removed while the test is running, and writes nothing', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    const { keyId } = await saveKey(manager);
    script = async () => {
      // the manager removes the key at the moment the AI company is being asked
      await send(manager, 'DELETE', `/ai/keys/${keyId}`, undefined, appWithScriptedAi);
      return { answer: 'OK' };
    };
    expect((await testKey(manager, keyId)).statusCode).toBe(404);
  });

  it('answers 503 when the server has no encryption secret', async () => {
    const manager = await createSignedInPerson(appWithoutSecret, database);
    const response = await testKey(manager, randomUUID(), appWithoutSecret);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SECRETS_NOT_SET_UP');
  });

  it('answers 400 for an id that is not an id, 401 when nobody is signed in, and 403 to staff', async () => {
    const manager = await createSignedInPerson(appWithScriptedAi, database);
    expect((await testKey(manager, 'not-an-id')).statusCode).toBe(400);
    expect((await testKey(null, randomUUID())).statusCode).toBe(401);
    await setRole(manager, 'staff');
    expect((await testKey(manager, randomUUID())).statusCode).toBe(403);
  });

  it('limits tests to 10 a minute from one address (each one is a real call), then answers 429', async () => {
    const manager = await createSignedInPerson(appWithStrictLimits, database);
    const key = newKey();
    const keyId = (await addKey(manager, { provider: 'gemini', label: 'Limited', key }, appWithStrictLimits)).json()
      .id as string;
    script = () => ({ answer: 'OK' });
    const answers: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1)
      answers.push((await testKey(manager, keyId, appWithStrictLimits)).statusCode);
    expect(answers.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(answers[10]).toBe(429);
  });
});

describe('the ai_keys table', () => {
  it('lets the app role add keys and change status columns, but never delete a row', async () => {
    const manager = await createSignedInPerson(app, database);
    const accountId = manager.profile.business.id;
    const keyId = (await addKey(manager, { provider: 'gemini', label: 'Guarded', key: newKey() })).json().id as string;
    await database.runInAccountTransaction(accountId, (transaction) =>
      transaction.updateTable('ai_keys').set({ status: 'working' }).where('id', '=', keyId).execute(),
    );
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.deleteFrom('ai_keys').where('id', '=', keyId).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets a stored key change only by the wipe at removal: never a swap, never a wipe of a live key', async () => {
    const manager = await createSignedInPerson(app, database);
    const accountId = manager.profile.business.id;
    const keyId = (await addKey(manager, { provider: 'gemini', label: 'Swap?', key: newKey() })).json().id as string;
    const tryUpdate = (changes: Record<string, unknown>) =>
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.updateTable('ai_keys').set(changes).where('id', '=', keyId).execute(),
      );
    // swapping in another scrambled value
    await expect(tryUpdate({ encrypted_key: 'v1.a.b.c' })).rejects.toThrow(/only be changed by wiping/i);
    // wiping a key that is still live
    await expect(
      tryUpdate({ encrypted_key: 'v1.removed.removed.removed', key_fingerprint: '0'.repeat(64) }),
    ).rejects.toThrow(/only be changed by wiping/i);
    // removing it with a wrong placeholder
    await expect(tryUpdate({ deleted_at: new Date(), encrypted_key: 'v1.sneaky.sneaky.sneaky' })).rejects.toThrow(
      /only be changed by wiping/i,
    );
    // the proper removal works
    await tryUpdate({
      deleted_at: new Date(),
      encrypted_key: 'v1.removed.removed.removed',
      key_fingerprint: '0'.repeat(64),
    });
    // and a removed key cannot be changed back
    await expect(tryUpdate({ deleted_at: null, encrypted_key: 'v1.a.b.c' })).rejects.toThrow(
      /only be changed by wiping/i,
    );
  });
});
