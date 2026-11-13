import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let appWithNoKeys: FastifyInstance;
let appWithKeys: FastifyInstance;

const SECRET_GEMINI_KEY = 'gemini-secret-key-should-never-appear';
const SECRET_OPENAI_KEY = 'openai-secret-key-should-never-appear';

beforeAll(async () => {
  database = openTestDatabase();
  appWithNoKeys = await buildTestApp(database);
  appWithKeys = await buildTestApp(database, [], {
    config: {
      ...testConfig(),
      ai: {
        platformKeys: { gemini: [SECRET_GEMINI_KEY, 'second-gemini-key'], openai: [SECRET_OPENAI_KEY], anthropic: [] },
      },
    },
  });
});
afterAll(async () => {
  await appWithNoKeys.close();
  await appWithKeys.close();
  await database.close();
});

/** GET /ai/models as the person (or as nobody). */
const getModels = (app: FastifyInstance, person: SignedInPerson | null) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/ai/models',
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

/** The platform team switches its keys on for the business (what a platform admin will do through the admin route). */
async function switchPlatformKeysOn(person: SignedInPerson, keyMode: 'platform' | 'own_then_platform' = 'platform') {
  await database.system
    .insertInto('ai_settings')
    .values({ account_id: person.profile.business.id, key_mode: keyMode, platform_enabled: true })
    .onConflict((conflict) => conflict.column('account_id').doUpdateSet({ key_mode: keyMode, platform_enabled: true }))
    .execute();
}

describe('GET /api/v1/ai/models', () => {
  it('lists the jobs and the starting models for a manager', async () => {
    const manager = await createSignedInPerson(appWithNoKeys, database);
    const response = await getModels(appWithNoKeys, manager);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.tasks.map((task: { id: string }) => task.id)).toEqual([
      'classify_conversation',
      'analyse_email',
      'draft_email',
      'chat_reply',
      'summarise',
      'setup_chat',
      'extract_from_website',
    ]);
    expect(body.models.map((model: { modelName: string }) => model.modelName)).toEqual([
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gpt-4o-mini',
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('says what each model is: kind, size, whether its name moves, when it retires, and its status', async () => {
    const manager = await createSignedInPerson(appWithNoKeys, database);
    const body = (await getModels(appWithNoKeys, manager)).json();
    const byName = (modelName: string) =>
      body.models.find((model: { modelName: string }) => model.modelName === modelName);
    expect(byName('gemini-flash-lite-latest')).toMatchObject({
      provider: 'gemini',
      kind: 'text',
      size: 'small',
      isAlias: true,
      retiresOn: null,
      status: 'active',
    });
    expect(byName('gemini-3.5-flash')).toMatchObject({ isAlias: false, size: 'medium' });
    expect(byName('gemini-2.5-flash')).toMatchObject({ status: 'deprecated' });
  });

  it('shows the models set for each job even when no key is set up, but nothing that would really be tried', async () => {
    const manager = await createSignedInPerson(appWithNoKeys, database);
    const body = (await getModels(appWithNoKeys, manager)).json();
    expect(body.models.every((model: { available: boolean }) => model.available === false)).toBe(true);
    expect(body.order.chat_reply).toEqual([]);
    expect(body.configuredOrder.chat_reply).toHaveLength(5);
    for (const task of body.tasks) expect(body.configuredOrder[task.id].length, task.id).toBeGreaterThan(0);
  });

  it('marks the models of a company with a key as available, and orders each job by its own setting', async () => {
    const manager = await createSignedInPerson(appWithKeys, database);
    await switchPlatformKeysOn(manager);
    const body = (await getModels(appWithKeys, manager)).json();
    const availableByName = Object.fromEntries(
      body.models.map((model: { modelName: string; available: boolean }) => [model.modelName, model.available]),
    );
    expect(availableByName).toMatchObject({
      'gemini-flash-lite-latest': true,
      'gemini-3.5-flash': true,
      'gpt-4o-mini': true,
      'claude-haiku-5-5': false,
      'claude-sonnet-5-5': false,
    });
    const nameOf = (modelId: string) =>
      body.models.find((model: { id: string }) => model.id === modelId).modelName as string;
    // sorting: small and quick first, the deprecated model last
    expect(body.order.classify_conversation.map(nameOf)).toEqual([
      'gemini-flash-lite-latest',
      'gpt-4o-mini',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ]);
    // email drafting starts with a different model than sorting does
    expect(body.order.draft_email.map(nameOf)[0]).toBe('gpt-4o-mini');
    // the setup chat starts with a stronger model
    expect(body.order.setup_chat.map(nameOf)[0]).toBe('gemini-3.5-flash');
  });

  it('never returns a key, only whether one exists', async () => {
    const manager = await createSignedInPerson(appWithKeys, database);
    await switchPlatformKeysOn(manager);
    const response = await getModels(appWithKeys, manager);
    expect(response.body).not.toContain(SECRET_GEMINI_KEY);
    expect(response.body).not.toContain(SECRET_OPENAI_KEY);
    expect(response.body).not.toContain('second-gemini-key');
  });

  it('shows no model as available to a business the platform has not switched its keys on for, even where platform keys exist', async () => {
    const manager = await createSignedInPerson(appWithKeys, database);
    const defaultBody = (await getModels(appWithKeys, manager)).json();
    expect(defaultBody.models.every((model: { available: boolean }) => model.available === false)).toBe(true);
    await database.system
      .insertInto('ai_settings')
      .values({ account_id: manager.profile.business.id, key_mode: 'platform', platform_enabled: false })
      .execute();
    const body = (await getModels(appWithKeys, manager)).json();
    expect(body.models.every((model: { available: boolean }) => model.available === false)).toBe(true);
    expect(body.order.chat_reply).toEqual([]);
  });

  it('shows no platform model after the end date', async () => {
    const manager = await createSignedInPerson(appWithKeys, database);
    await database.system
      .insertInto('ai_settings')
      .values({
        account_id: manager.profile.business.id,
        key_mode: 'platform',
        platform_enabled: true,
        platform_expires_at: new Date(Date.now() - 1000),
      })
      .execute();
    const body = (await getModels(appWithKeys, manager)).json();
    expect(body.order.chat_reply).toEqual([]);
  });

  it('makes a company available when the business has its own key for it, in a mode that uses own keys', async () => {
    const manager = await createSignedInPerson(appWithNoKeys, database);
    await appWithNoKeys.inject({
      method: 'POST',
      url: '/api/v1/ai/keys',
      headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
      payload: { provider: 'openai', label: 'Mine', key: `sk-test-${randomUUID().replace(/-/g, '')}` },
    });
    const body = (await getModels(appWithNoKeys, manager)).json();
    const nameOf = (modelId: string) =>
      body.models.find((model: { id: string }) => model.id === modelId).modelName as string;
    expect(
      body.models
        .filter((model: { available: boolean }) => model.available)
        .map((model: { modelName: string }) => model.modelName),
    ).toEqual(['gpt-4o-mini']);
    expect(body.order.chat_reply.map(nameOf)).toEqual(['gpt-4o-mini']);
    // in platform-only mode the business's own key is not used
    await database.system
      .insertInto('ai_settings')
      .values({ account_id: manager.profile.business.id, key_mode: 'platform', platform_enabled: true })
      .execute();
    const platformOnly = (await getModels(appWithNoKeys, manager)).json();
    expect(platformOnly.order.chat_reply).toEqual([]);
  });

  it('shows the business’s own order as the configured order for the job it set, and the platform’s for the rest', async () => {
    const manager = await createSignedInPerson(appWithKeys, database);
    await switchPlatformKeysOn(manager);
    const models = (await getModels(appWithKeys, manager)).json().models as Array<{ id: string; modelName: string }>;
    const gptId = models.find((model) => model.modelName === 'gpt-4o-mini')?.id as string;
    await database.system
      .updateTable('ai_settings')
      .set({ task_models: { chat_reply: [gptId] } })
      .where('account_id', '=', manager.profile.business.id)
      .execute();
    const body = (await getModels(appWithKeys, manager)).json();
    expect(body.configuredOrder.chat_reply).toEqual([gptId]);
    expect(body.order.chat_reply).toEqual([gptId]);
    expect(body.configuredOrder.summarise).toHaveLength(5);
  });

  it('answers 401 when nobody is signed in', async () => {
    expect((await getModels(appWithNoKeys, null)).statusCode).toBe(401);
  });

  it('answers 403 to a staff member (managers only)', async () => {
    const person = await createSignedInPerson(appWithNoKeys, database);
    await database.system
      .updateTable('users')
      .set({ role: 'staff' })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await getModels(appWithNoKeys, person)).statusCode).toBe(403);
  });
});

describe('the ai_models table', () => {
  it('can be read by the app role but not changed by it', async () => {
    const readable = await database.runInAccountTransaction(randomUUID(), (transaction) =>
      transaction.selectFrom('ai_models').select('id').execute(),
    );
    expect(readable.length).toBeGreaterThanOrEqual(6);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction
          .insertInto('ai_models')
          .values({ provider: 'openai', model_name: 'sneaky', label: 'Sneaky' })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.updateTable('ai_models').set({ status: 'retired' }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) => transaction.deleteFrom('ai_models').execute()),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps the model order per job in a table the app role can read but not change', async () => {
    const readable = await database.runInAccountTransaction(randomUUID(), (transaction) =>
      transaction.selectFrom('ai_task_models').select('task').execute(),
    );
    expect(readable.length).toBeGreaterThanOrEqual(30);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.updateTable('ai_task_models').set({ position: 9 }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.deleteFrom('ai_task_models').execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a company or a status it does not know', async () => {
    await expect(
      database.system
        .insertInto('ai_models')
        .values({ provider: 'gemini', model_name: 'x', label: 'x', status: 'weird' as never })
        .execute(),
    ).rejects.toThrow();
    await expect(
      database.system
        .insertInto('ai_models')
        .values({ provider: 'mistral' as never, model_name: 'x', label: 'x' })
        .execute(),
    ).rejects.toThrow();
  });
});
