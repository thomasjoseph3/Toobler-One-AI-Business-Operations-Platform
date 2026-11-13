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

const send = (person: SignedInPerson | null, method: 'GET' | 'PUT', payload?: unknown) =>
  app.inject({
    method,
    url: '/api/v1/ai/settings',
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const getSettings = (person: SignedInPerson | null) => send(person, 'GET');
const putSettings = (person: SignedInPerson | null, body: unknown) => send(person, 'PUT', body);

/** The ids of models by name. */
async function modelIds(...names: string[]) {
  const rows = await database.system.selectFrom('ai_models').select(['id', 'model_name']).execute();
  return names.map((name) => rows.find((row) => row.model_name === name)?.id as string);
}

async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('GET /api/v1/ai/settings', () => {
  it('gives the defaults to a business that has saved nothing: its own keys, no overrides, no platform access', async () => {
    const manager = await createSignedInPerson(app, database);
    const response = await getSettings(manager);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      keyMode: 'own',
      taskModels: {},
      platformAccess: { enabled: false, monthlyCallCap: null, expiresAt: null },
    });
    // looking does not create a row
    const rows = await database.system
      .selectFrom('ai_settings')
      .select('account_id')
      .where('account_id', '=', manager.profile.business.id)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('shows what the platform allowed, read-only', async () => {
    const manager = await createSignedInPerson(app, database);
    const endsAt = new Date('2030-01-01T00:00:00Z');
    await database.system
      .insertInto('ai_settings')
      .values({
        account_id: manager.profile.business.id,
        platform_enabled: true,
        platform_monthly_call_cap: 500,
        platform_expires_at: endsAt,
      })
      .execute();
    expect((await getSettings(manager)).json().platformAccess).toEqual({
      enabled: true,
      monthlyCallCap: 500,
      expiresAt: endsAt.toISOString(),
    });
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await getSettings(null)).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    await setRole(person, 'staff');
    expect((await getSettings(person)).statusCode).toBe(403);
  });
});

describe('PUT /api/v1/ai/settings', () => {
  it('changes the key mode, and creates the row the first time', async () => {
    const manager = await createSignedInPerson(app, database);
    const response = await putSettings(manager, { keyMode: 'own_then_platform' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().keyMode).toBe('own_then_platform');
    expect((await getSettings(manager)).json().keyMode).toBe('own_then_platform');
    const row = await database.system
      .selectFrom('ai_settings')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: manager.profile.user.id });
    // a platform mode can be chosen even before the platform has switched its keys on; the answer shows what is allowed
    expect(response.json().platformAccess.enabled).toBe(false);
  });

  it('saves the business’s own model order for a job, and replaces the whole set each time', async () => {
    const manager = await createSignedInPerson(app, database);
    const [gptMini, flash, flashLite] = await modelIds('gpt-4o-mini', 'gemini-3.5-flash', 'gemini-3.5-flash-lite');
    const first = await putSettings(manager, { taskModels: { chat_reply: [gptMini, flash], summarise: [flashLite] } });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().taskModels).toEqual({ chat_reply: [gptMini, flash], summarise: [flashLite] });
    // sending only one job drops the other (the set is replaced, not merged)
    const second = await putSettings(manager, { taskModels: { chat_reply: [flash] } });
    expect(second.json().taskModels).toEqual({ chat_reply: [flash] });
    // an empty set clears every override
    expect((await putSettings(manager, { taskModels: {} })).json().taskModels).toEqual({});
    // the key mode was never touched by these
    expect(second.json().keyMode).toBe('own');
  });

  it('changes only the fields sent', async () => {
    const manager = await createSignedInPerson(app, database);
    const [flash] = await modelIds('gemini-3.5-flash');
    await putSettings(manager, { keyMode: 'platform', taskModels: { chat_reply: [flash] } });
    const onlyMode = await putSettings(manager, { keyMode: 'own' });
    expect(onlyMode.json()).toMatchObject({ keyMode: 'own', taskModels: { chat_reply: [flash] } });
    const onlyModels = await putSettings(manager, { taskModels: {} });
    expect(onlyModels.json()).toMatchObject({ keyMode: 'own', taskModels: {} });
  });

  it('writes one log line and one event with the field names, never the model ids', async () => {
    const manager = await createSignedInPerson(app, database);
    const [flash] = await modelIds('gemini-3.5-flash');
    await putSettings(manager, { keyMode: 'platform', taskModels: { chat_reply: [flash] } });
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('kind', '=', 'ai.settings_updated')
      .execute();
    expect(logLines).toHaveLength(1);
    expect(logLines[0]?.fields).toEqual(['keyMode', 'taskModels']);
    expect(JSON.stringify(logLines)).not.toContain(flash);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', manager.profile.business.id)
      .where('name', '=', 'ai.settings_updated')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(flash);
  });

  it('answers 400 NOTHING_TO_CHANGE when nothing is sent', async () => {
    const manager = await createSignedInPerson(app, database);
    const response = await putSettings(manager, {});
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('NOTHING_TO_CHANGE');
  });

  it('answers 400 INVALID_TASK_MODELS naming each problem, and saves nothing', async () => {
    const manager = await createSignedInPerson(app, database);
    const [flash] = await modelIds('gemini-3.5-flash');
    await database.system
      .updateTable('ai_models')
      .set({ status: 'retired' })
      .where('model_name', '=', 'gemini-3.1-flash-lite')
      .execute();
    try {
      const [retired] = await modelIds('gemini-3.1-flash-lite');
      const response = await putSettings(manager, {
        taskModels: { not_a_job: [flash], chat_reply: [randomUUID(), retired, flash, flash] },
      });
      expect(response.statusCode, response.body).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TASK_MODELS');
      const problems: string[] = response.json().error.details.problems;
      expect(problems).toEqual(
        expect.arrayContaining([
          '"not_a_job" is not a job the AI does',
          'chat_reply: the same model is listed twice',
          'chat_reply: gemini-3.1-flash-lite is retired and cannot be used',
        ]),
      );
      expect(problems.some((problem) => problem.includes('there is no model with the id'))).toBe(true);
    } finally {
      await database.system
        .updateTable('ai_models')
        .set({ status: 'active' })
        .where('model_name', '=', 'gemini-3.1-flash-lite')
        .execute();
    }
    expect((await getSettings(manager)).json().taskModels).toEqual({});
  });

  it('answers 400 for bad input: an unknown mode, a non-id, too many models, an empty list, and the platform’s own fields', async () => {
    const manager = await createSignedInPerson(app, database);
    const bad: unknown[] = [
      { keyMode: 'everything' },
      { taskModels: { chat_reply: ['not-an-id'] } },
      { taskModels: { chat_reply: Array.from({ length: 9 }, () => randomUUID()) } },
      { taskModels: { chat_reply: [] } },
      { taskModels: 'nope' },
      { platformEnabled: true },
      { platformMonthlyCallCap: 1000000 },
      { keyMode: 'own', platformExpiresAt: null },
      'not an object',
    ];
    for (const body of bad) {
      const response = await putSettings(manager, body);
      expect(response.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    const row = await database.system
      .selectFrom('ai_settings')
      .select('account_id')
      .where('account_id', '=', manager.profile.business.id)
      .execute();
    expect(row).toHaveLength(0);
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await putSettings(null, { keyMode: 'own' })).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    await setRole(person, 'staff');
    expect((await putSettings(person, { keyMode: 'own' })).statusCode).toBe(403);
  });

  it('keeps one business’s settings out of another’s', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await putSettings(first, { keyMode: 'platform' });
    expect((await getSettings(second)).json().keyMode).toBe('own');
  });
});

describe('the ai_settings table', () => {
  it('lets the app role write the manager’s columns but never the platform’s, and never delete the row', async () => {
    const manager = await createSignedInPerson(app, database);
    const accountId = manager.profile.business.id;
    await putSettings(manager, { keyMode: 'own_then_platform' });
    const tryUpdate = (changes: Record<string, unknown>) =>
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.updateTable('ai_settings').set(changes).where('account_id', '=', accountId).execute(),
      );
    await tryUpdate({ key_mode: 'own' });
    for (const platformChange of [
      { platform_enabled: true },
      { platform_monthly_call_cap: 5 },
      { platform_expires_at: new Date() },
      { notices_enabled: false },
    ]) {
      await expect(tryUpdate(platformChange)).rejects.toThrow(/permission denied/i);
    }
    await expect(
      database.runInAccountTransaction(accountId, (transaction) => transaction.deleteFrom('ai_settings').execute()),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses an insert by the app role that sets the platform’s columns', async () => {
    const manager = await createSignedInPerson(app, database);
    const accountId = manager.profile.business.id;
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.insertInto('ai_settings').values({ account_id: accountId, platform_enabled: true }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
