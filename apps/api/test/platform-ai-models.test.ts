import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let platformAdmin: SignedInPerson;
/** The job orders as they were before this file, put back after every test (the list is shared by every test file). */
let originalTaskModels: Array<{ task: string; position: number; model_id: string }>;
const addedModelNames: string[] = [];

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  platformAdmin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
  originalTaskModels = await database.system.selectFrom('ai_task_models').selectAll().execute();
});
afterEach(async () => {
  await database.system.deleteFrom('ai_task_models').execute();
  await database.system.insertInto('ai_task_models').values(originalTaskModels).execute();
});
afterAll(async () => {
  // Models this file added are removed (no order points at them, so nothing else is touched)
  await database.system
    .deleteFrom('ai_task_models')
    .where(
      'model_id',
      'in',
      database.system.selectFrom('ai_models').select('id').where('model_name', 'in', addedModelNames),
    )
    .execute();
  if (addedModelNames.length > 0)
    await database.system.deleteFrom('ai_models').where('model_name', 'in', addedModelNames).execute();
  await database.system
    .updateTable('ai_models')
    .set({ status: 'active', retires_on: null, label: 'Gemini 3.1 Flash-Lite' })
    .where('model_name', '=', 'gemini-3.1-flash-lite')
    .execute();
  await app.close();
  await database.close();
});

const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A made-up model name that no other test uses. */
function newModelName() {
  const name = `test-model-${randomUUID().slice(0, 8)}`;
  addedModelNames.push(name);
  return name;
}

describe('GET /api/v1/platform/ai/models', () => {
  it('lists every model with all its facts, and the platform’s order for every job', async () => {
    const response = await send(platformAdmin, 'GET', '/platform/ai/models');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.models.length).toBeGreaterThanOrEqual(10);
    expect(
      body.models.find((model: { modelName: string }) => model.modelName === 'gemini-flash-lite-latest'),
    ).toMatchObject({
      provider: 'gemini',
      kind: 'text',
      size: 'small',
      isAlias: true,
      status: 'active',
      retiresOn: null,
    });
    expect(Object.keys(body.taskModels).sort()).toEqual([
      'analyse_email',
      'chat_reply',
      'classify_conversation',
      'draft_email',
      'extract_from_website',
      'setup_chat',
      'summarise',
    ]);
    expect(body.taskModels.chat_reply).toHaveLength(5);
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s manager', async () => {
    expect((await send(null, 'GET', '/platform/ai/models')).statusCode).toBe(401);
    const manager = await createSignedInPerson(app, database);
    expect((await send(manager, 'GET', '/platform/ai/models')).statusCode).toBe(403);
  });
});

describe('POST /api/v1/platform/ai/models', () => {
  it('adds a model with sensible defaults, in no job’s order yet', async () => {
    const modelName = newModelName();
    const response = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'openai',
      modelName,
      label: '  A new   model ',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      provider: 'openai',
      modelName,
      label: 'A new model',
      tasks: [],
      status: 'active',
      kind: 'text',
      size: 'small',
      isAlias: false,
      retiresOn: null,
      sortOrder: 100,
    });
    const body = (await send(platformAdmin, 'GET', '/platform/ai/models')).json();
    const id = response.json().id as string;
    expect(Object.values(body.taskModels as Record<string, string[]>).flat()).not.toContain(id);
  });

  it('adds a model with every fact given, including the day the company retires it', async () => {
    const modelName = newModelName();
    const response = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'gemini',
      modelName,
      label: 'Preview model',
      tasks: ['chat_reply', 'summarise'],
      status: 'deprecated',
      kind: 'text',
      size: 'large',
      isAlias: true,
      retiresOn: '2027-03-31',
      sortOrder: 7,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      tasks: ['chat_reply', 'summarise'],
      status: 'deprecated',
      size: 'large',
      isAlias: true,
      retiresOn: '2027-03-31',
      sortOrder: 7,
    });
  });

  it('answers 409 AI_MODEL_EXISTS for a name the company already has, but allows it for another company', async () => {
    const modelName = newModelName();
    expect(
      (await send(platformAdmin, 'POST', '/platform/ai/models', { provider: 'gemini', modelName, label: 'First' }))
        .statusCode,
    ).toBe(201);
    const again = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'gemini',
      modelName,
      label: 'Second',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('AI_MODEL_EXISTS');
    expect(
      (
        await send(platformAdmin, 'POST', '/platform/ai/models', {
          provider: 'openai',
          modelName,
          label: 'Other company',
        })
      ).statusCode,
    ).toBe(201);
  });

  it('answers 400 UNKNOWN_JOBS for a job that is not one, and 400 for bad input', async () => {
    const modelName = newModelName();
    const unknownJob = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'gemini',
      modelName,
      label: 'X',
      tasks: ['make_coffee'],
    });
    expect(unknownJob.statusCode).toBe(400);
    expect(unknownJob.json().error.code).toBe('UNKNOWN_JOBS');
    const bad: unknown[] = [
      { provider: 'mistral', modelName, label: 'X' },
      { provider: 'gemini', modelName: 'has space', label: 'X' },
      { provider: 'gemini', modelName: '', label: 'X' },
      { provider: 'gemini', modelName: 'm'.repeat(101), label: 'X' },
      { provider: 'gemini', modelName, label: '  ' },
      { provider: 'gemini', modelName, label: 'X', size: 'huge' },
      { provider: 'gemini', modelName, label: 'X', retiresOn: 'next year' },
      { provider: 'gemini', modelName, label: 'X', retiresOn: '2027-02-31' },
      { provider: 'gemini', modelName, label: 'X', sortOrder: 0 },
      { provider: 'gemini', modelName, label: 'X', id: randomUUID() },
      { provider: 'gemini', label: 'X' },
    ];
    for (const body of bad)
      expect((await send(platformAdmin, 'POST', '/platform/ai/models', body)).statusCode, JSON.stringify(body)).toBe(
        400,
      );
  });

  it('writes a log line under the admin’s business with field names, never values', async () => {
    const modelName = newModelName();
    const response = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'gemini',
      modelName,
      label: 'Logged model',
    });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', platformAdmin.profile.business.id)
      .where('kind', '=', 'platform.ai_model_added')
      .where('record_id', '=', response.json().id)
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.actor).toEqual({ kind: 'user', id: platformAdmin.profile.user.id });
    expect(JSON.stringify(lines)).not.toContain(modelName);
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s manager (who cannot add models)', async () => {
    const body = { provider: 'gemini', modelName: newModelName(), label: 'Nope' };
    expect((await send(null, 'POST', '/platform/ai/models', body)).statusCode).toBe(401);
    const manager = await createSignedInPerson(app, database);
    expect((await send(manager, 'POST', '/platform/ai/models', body)).statusCode).toBe(403);
    const rows = await database.system
      .selectFrom('ai_models')
      .select('id')
      .where('model_name', '=', body.modelName)
      .execute();
    expect(rows).toHaveLength(0);
  });
});

describe('PATCH /api/v1/platform/ai/models/{id}', () => {
  async function addModel(extra: Record<string, unknown> = {}) {
    const response = await send(platformAdmin, 'POST', '/platform/ai/models', {
      provider: 'gemini',
      modelName: newModelName(),
      label: 'To change',
      ...extra,
    });
    return response.json().id as string;
  }

  it('changes only the fields sent, and null clears the retirement date', async () => {
    const id = await addModel({ retiresOn: '2027-01-01', size: 'medium' });
    const changed = await send(platformAdmin, 'PATCH', `/platform/ai/models/${id}`, {
      status: 'deprecated',
      retiresOn: '2027-06-30',
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({
      status: 'deprecated',
      retiresOn: '2027-06-30',
      size: 'medium',
      label: 'To change',
    });
    const cleared = await send(platformAdmin, 'PATCH', `/platform/ai/models/${id}`, {
      retiresOn: null,
      label: '  Renamed  model ',
    });
    expect(cleared.json()).toMatchObject({ retiresOn: null, label: 'Renamed model', status: 'deprecated' });
  });

  it('retiring a model takes it out of every job’s answers at once', async () => {
    const business = await createSignedInPerson(app, database);
    // a model in a job's order, with a key for its company, so it would be tried
    const orderBefore = (await send(platformAdmin, 'GET', '/platform/ai/models')).json().taskModels
      .chat_reply as string[];
    const models = (await send(platformAdmin, 'GET', '/platform/ai/models')).json().models as Array<{
      id: string;
      modelName: string;
    }>;
    const retiringId = orderBefore[0] as string;
    expect(models.find((model) => model.id === retiringId)).toBeDefined();
    await database.system
      .insertInto('ai_settings')
      .values({ account_id: business.profile.business.id, key_mode: 'own' })
      .execute();
    await send(platformAdmin, 'PATCH', `/platform/ai/models/${retiringId}`, { status: 'retired' });
    try {
      const status = await send(platformAdmin, 'GET', '/platform/ai/models');
      expect(
        (status.json().models as Array<{ id: string; status: string }>).find((model) => model.id === retiringId)
          ?.status,
      ).toBe('retired');
      // the platform's order still lists it (so it can be put back), but the answer for a business skips it
      const forBusiness = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/models',
        headers: { ...unsafeRequestHeaders, cookie: business.cookieHeader },
      });
      expect(forBusiness.json().order.chat_reply).not.toContain(retiringId);
    } finally {
      await send(platformAdmin, 'PATCH', `/platform/ai/models/${retiringId}`, { status: 'active' });
    }
  });

  it('answers 404 for an unknown model, 400 for nothing to change, an unknown job, and fields it must not change', async () => {
    const id = await addModel();
    expect((await send(platformAdmin, 'PATCH', `/platform/ai/models/${randomUUID()}`, { label: 'x' })).statusCode).toBe(
      404,
    );
    const nothing = await send(platformAdmin, 'PATCH', `/platform/ai/models/${id}`, {});
    expect(nothing.statusCode).toBe(400);
    expect(nothing.json().error.code).toBe('NOTHING_TO_CHANGE');
    expect(
      (await send(platformAdmin, 'PATCH', `/platform/ai/models/${id}`, { tasks: ['make_coffee'] })).json().error.code,
    ).toBe('UNKNOWN_JOBS');
    for (const body of [
      { provider: 'openai' },
      { modelName: 'renamed' },
      { status: 'gone' },
      { retiresOn: 'soon' },
      { sortOrder: 10000 },
      { id: randomUUID() },
    ]) {
      expect(
        (await send(platformAdmin, 'PATCH', `/platform/ai/models/${id}`, body)).statusCode,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect((await send(platformAdmin, 'PATCH', '/platform/ai/models/not-an-id', { label: 'x' })).statusCode).toBe(400);
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s manager', async () => {
    const id = await addModel();
    expect((await send(null, 'PATCH', `/platform/ai/models/${id}`, { status: 'retired' })).statusCode).toBe(401);
    const manager = await createSignedInPerson(app, database);
    expect((await send(manager, 'PATCH', `/platform/ai/models/${id}`, { status: 'retired' })).statusCode).toBe(403);
    expect(
      (await send(platformAdmin, 'GET', '/platform/ai/models'))
        .json()
        .models.find((model: { id: string }) => model.id === id).status,
    ).toBe('active');
  });
});

describe('PUT /api/v1/platform/ai/tasks/{taskId}/models', () => {
  it('sets the order of models for one job and leaves the other jobs alone', async () => {
    const before = (await send(platformAdmin, 'GET', '/platform/ai/models')).json();
    const [first, second] = (before.taskModels.summarise as string[]).slice(0, 2) as [string, string];
    const response = await send(platformAdmin, 'PUT', '/platform/ai/tasks/summarise/models', {
      modelIds: [second, first],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ taskId: 'summarise', modelIds: [second, first] });
    const after = (await send(platformAdmin, 'GET', '/platform/ai/models')).json();
    expect(after.taskModels.summarise).toEqual([second, first]);
    expect(after.taskModels.chat_reply).toEqual(before.taskModels.chat_reply);
  });

  it('changes what a business is told to try for that job, unless it set its own order', async () => {
    const following = await createSignedInPerson(app, database);
    const own = await createSignedInPerson(app, database);
    const models = (await send(platformAdmin, 'GET', '/platform/ai/models')).json().models as Array<{
      id: string;
      modelName: string;
    }>;
    const idOf = (name: string) => models.find((model) => model.modelName === name)?.id as string;
    await database.system
      .insertInto('ai_settings')
      .values([
        { account_id: following.profile.business.id },
        { account_id: own.profile.business.id, task_models: { chat_reply: [idOf('gpt-4o-mini')] } },
      ])
      .execute();
    await send(platformAdmin, 'PUT', '/platform/ai/tasks/chat_reply/models', { modelIds: [idOf('gemini-3.5-flash')] });
    const configuredFor = async (person: SignedInPerson) =>
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/ai/models',
          headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
        })
      ).json().configuredOrder.chat_reply;
    expect(await configuredFor(following)).toEqual([idOf('gemini-3.5-flash')]);
    expect(await configuredFor(own)).toEqual([idOf('gpt-4o-mini')]);
  });

  it('answers 404 for a job that is not one, and 400 INVALID_TASK_MODELS naming each problem, changing nothing', async () => {
    const before = (await send(platformAdmin, 'GET', '/platform/ai/models')).json().taskModels.chat_reply as string[];
    expect(
      (await send(platformAdmin, 'PUT', '/platform/ai/tasks/make_coffee/models', { modelIds: [before[0]] })).statusCode,
    ).toBe(404);
    const retiredName = newModelName();
    const retiredId = (
      await send(platformAdmin, 'POST', '/platform/ai/models', {
        provider: 'gemini',
        modelName: retiredName,
        label: 'Gone',
        status: 'retired',
      })
    ).json().id as string;
    const voiceId = (
      await send(platformAdmin, 'POST', '/platform/ai/models', {
        provider: 'gemini',
        modelName: newModelName(),
        label: 'Talker',
        kind: 'voice',
      })
    ).json().id as string;
    const response = await send(platformAdmin, 'PUT', '/platform/ai/tasks/chat_reply/models', {
      modelIds: [randomUUID(), retiredId, voiceId, before[0], before[0]],
    });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('INVALID_TASK_MODELS');
    const problems: string[] = response.json().error.details.problems;
    expect(problems.some((problem) => problem.includes('the same model is listed twice'))).toBe(true);
    expect(problems.some((problem) => problem.includes(`${retiredName} is retired`))).toBe(true);
    expect(problems.some((problem) => problem.includes('is a voice model'))).toBe(true);
    expect(problems.some((problem) => problem.includes('there is no model with the id'))).toBe(true);
    expect((await send(platformAdmin, 'GET', '/platform/ai/models')).json().taskModels.chat_reply).toEqual(before);
  });

  it('answers 400 for an empty list, too many models, and ids that are not ids', async () => {
    for (const body of [
      { modelIds: [] },
      { modelIds: Array.from({ length: 9 }, () => randomUUID()) },
      { modelIds: ['nope'] },
      {},
      { modelIds: [randomUUID()], extra: 1 },
    ]) {
      expect(
        (await send(platformAdmin, 'PUT', '/platform/ai/tasks/chat_reply/models', body)).statusCode,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s manager', async () => {
    const ids = (
      (await send(platformAdmin, 'GET', '/platform/ai/models')).json().taskModels.chat_reply as string[]
    ).slice(0, 1);
    expect((await send(null, 'PUT', '/platform/ai/tasks/chat_reply/models', { modelIds: ids })).statusCode).toBe(401);
    const manager = await createSignedInPerson(app, database);
    expect((await send(manager, 'PUT', '/platform/ai/tasks/chat_reply/models', { modelIds: ids })).statusCode).toBe(
      403,
    );
  });
});
