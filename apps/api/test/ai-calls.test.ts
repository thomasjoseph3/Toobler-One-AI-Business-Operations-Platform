import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Database } from '../src/kernel/database';
import { createAiService, type AiCallRecord } from '../src/modules/core/ai';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
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

const tag = { task: 'chat_reply', agentId: 'test', channel: 'internal', promptVersion: 'test-1' };
const prompt = { stableSystemText: 'rules', messages: [{ role: 'user' as const, text: 'hello' }] };

/** How the business is set up for the AI: the platform side and the manager side. */
interface BusinessSetup {
  keyMode?: 'own' | 'platform' | 'own_then_platform';
  platformEnabled?: boolean;
  platformExpiresAt?: Date | null;
  taskModels?: Record<string, string[]>;
}

/** A new business with its AI settings written the way the manager and the platform team would have written them. */
async function newBusiness(setup: BusinessSetup = {}) {
  const manager = await createSignedInPerson(app, database);
  const accountId = manager.profile.business.id;
  await database.system
    .insertInto('ai_settings')
    .values({
      account_id: accountId,
      key_mode: setup.keyMode ?? 'platform',
      platform_enabled: setup.platformEnabled ?? true,
      platform_expires_at: setup.platformExpiresAt ?? null,
      task_models: setup.taskModels ?? {},
    })
    .execute();
  return { manager, accountId };
}

/** The business saves one of its own keys the way a manager does. Returns the key text and its id. */
async function saveOwnKey(manager: SignedInPerson, provider: 'gemini' | 'openai' | 'anthropic', label = 'Own') {
  const key = `AIzaSyOwn${randomUUID().replace(/-/g, '')}`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ai/keys',
    headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
    payload: { provider, label, key },
  });
  expect(response.statusCode, response.body).toBe(201);
  return { key, keyId: response.json().id as string };
}

/** The ids of models by name, as the catalogue has them. */
async function modelIds(...names: string[]) {
  const rows = await database.system.selectFrom('ai_models').select(['id', 'model_name']).execute();
  return names.map((name) => rows.find((row) => row.model_name === name)?.id as string);
}

/** A service with its own platform keys (unique per test so key pools never leak between tests) and a pretend AI. */
function serviceWith(
  platformKeys: { gemini?: string[]; openai?: string[] },
  script: Parameters<typeof createScriptedLlmProvider>[0],
  records: AiCallRecord[] = [],
) {
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: platformKeys.gemini ?? [], openai: platformKeys.openai ?? [], anthropic: [] } },
  };
  const llm = createScriptedLlmProvider(script);
  const problems: string[] = [];
  const service = createAiService({
    database,
    config,
    llm,
    recorder: { record: async (record) => void records.push(record) },
    reportProblem: (what) => void problems.push(what),
  });
  return { service, llm, records, problems };
}

describe('the AI service on the platform’s keys', () => {
  it('answers a job from the first model and key, and records the call', async () => {
    const { accountId } = await newBusiness();
    const { service, records } = serviceWith({ gemini: ['calls-a1'] }, () => ({ answer: 'hello back' }));
    const result = await service.generateText({ accountId, tag, prompt });
    expect(result.text).toBe('hello back');
    expect(result.details.servedBy).toMatchObject({
      provider: 'gemini',
      modelName: 'gemini-flash-lite-latest',
      keySource: 'platform',
      keyPosition: 1,
    });
    expect(result.details.fallbackUsed).toBe(false);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ accountId, tag, details: { fallbackUsed: false } });
  });

  it("tries every key on the job's first model, then its next model, then the next company", async () => {
    const { accountId } = await newBusiness();
    const tried: string[] = [];
    const { service } = serviceWith({ gemini: ['calls-b1', 'calls-b2'], openai: ['calls-b-open'] }, (candidate) => {
      tried.push(`${candidate.modelName}#${candidate.keyPosition}`);
      if (candidate.provider === 'gemini') throw new Error('429 quota exceeded');
      return { answer: 'openai saved the day' };
    });
    const result = await service.generateText({ accountId, tag, prompt });
    expect(result.text).toBe('openai saved the day');
    // the chat_reply setting is: Gemini lite (latest), then GPT mini
    expect(tried).toEqual(['gemini-flash-lite-latest#1', 'gemini-flash-lite-latest#2', 'gpt-4o-mini#1']);
    expect(result.details).toMatchObject({ fallbackUsed: true, fallbackReason: 'rate_limited' });
  });

  it('works through the whole setting for a job, deprecated model last, when every try fails', async () => {
    const { accountId } = await newBusiness();
    const tried: string[] = [];
    const { service } = serviceWith({ gemini: ['calls-g1', 'calls-g2'] }, (candidate) => {
      tried.push(`${candidate.modelName}#${candidate.keyPosition}`);
      throw new Error('socket hang up');
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({ status: 502 });
    expect(tried).toEqual([
      'gemini-flash-lite-latest#1',
      'gemini-flash-lite-latest#2',
      'gemini-3.5-flash-lite#1',
      'gemini-3.5-flash-lite#2',
      'gemini-3.1-flash-lite#1',
      'gemini-3.1-flash-lite#2',
      'gemini-2.5-flash#1',
      'gemini-2.5-flash#2',
    ]);
  });

  it('uses a different model order for a different job', async () => {
    const { accountId } = await newBusiness();
    const firstModel: string[] = [];
    const { service } = serviceWith({ gemini: ['calls-j1'], openai: ['calls-j-open'] }, (candidate) => {
      firstModel.push(candidate.modelName);
      return { answer: 'ok' };
    });
    await service.generateText({ accountId, tag: { ...tag, task: 'draft_email' }, prompt });
    await service.generateText({ accountId, tag: { ...tag, task: 'setup_chat' }, prompt });
    expect(firstModel).toEqual(['gpt-4o-mini', 'gemini-3.5-flash']);
  });

  it('rests a key that hit a limit, so the next call tries the other key first', async () => {
    const { accountId } = await newBusiness();
    const keysTried: number[] = [];
    const { service } = serviceWith({ gemini: ['calls-c1', 'calls-c2'] }, (candidate) => {
      keysTried.push(candidate.keyPosition);
      if (candidate.keyPosition === 1) throw new Error('429 quota exceeded');
      return { answer: 'ok' };
    });
    await service.generateText({ accountId, tag, prompt }); // key 1 may be tried and fails, key 2 answers
    keysTried.length = 0;
    await service.generateText({ accountId, tag, prompt });
    await service.generateText({ accountId, tag, prompt });
    expect(keysTried[0]).toBe(2);
    expect(keysTried).not.toContain(1);
  });

  it('records a failed call, answers 429 for a quota and 502 otherwise, with no key or provider text', async () => {
    const { accountId } = await newBusiness();
    const records: AiCallRecord[] = [];
    const quota = serviceWith(
      { gemini: ['calls-d1-secret'] },
      () => {
        throw new Error('429 quota exceeded for key calls-d1-secret');
      },
      records,
    );
    const quotaError = await quota.service.generateText({ accountId, tag, prompt }).catch((caught: unknown) => caught);
    expect(quotaError).toMatchObject({ status: 429, code: 'AI_RATE_LIMITED' });
    expect(JSON.stringify(quotaError)).not.toContain('calls-d1-secret');
    expect(String((quotaError as Error).message)).not.toContain('calls-d1-secret');
    expect(records[0]).toMatchObject({ details: null });
    expect(records[0]?.attempts.length).toBeGreaterThan(0);

    const broken = serviceWith({ gemini: ['calls-d2'] }, () => {
      throw new Error('socket hang up');
    });
    await expect(broken.service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({
      status: 502,
      code: 'AI_FAILED',
    });
  });

  it('gives an answer that fits the shape, and passes the tag, prompt and options on', async () => {
    const { accountId } = await newBusiness();
    const shape = z.object({ type: z.string(), confidence: z.number() });
    const { service, llm } = serviceWith({ gemini: ['calls-f1'] }, () => ({
      answer: { type: 'complaint', confidence: 0.9 },
    }));
    const result = await service.generateObject(
      { accountId, tag, prompt, temperature: 0, maxOutputTokens: 200 },
      shape,
    );
    expect(result.value).toEqual({ type: 'complaint', confidence: 0.9 });
    expect(llm.requests[0]).toMatchObject({ tag, temperature: 0, maxOutputTokens: 200, prompt });
  });

  it('answers 503 for a job no model is set for', async () => {
    const { accountId } = await newBusiness();
    const { service } = serviceWith({ gemini: ['calls-e1'] }, () => ({ answer: 'never' }));
    await expect(
      service.generateText({ accountId, tag: { ...tag, task: 'nobody_does_this' }, prompt }),
    ).rejects.toMatchObject({ status: 503, code: 'AI_NOT_AVAILABLE' });
  });
});

describe('what the platform allows the business', () => {
  it('refuses the platform’s keys until the platform has switched them on (503 AI_ACCESS_NOT_ENABLED)', async () => {
    const { accountId } = await newBusiness({ keyMode: 'platform', platformEnabled: false });
    const { service, llm } = serviceWith({ gemini: ['allow-a1'] }, () => ({ answer: 'never' }));
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({
      status: 503,
      code: 'AI_ACCESS_NOT_ENABLED',
    });
    expect(llm.requests).toHaveLength(0);
  });

  it('refuses the platform’s keys after the end date (503 AI_ACCESS_ENDED), and allows them before it', async () => {
    const ended = await newBusiness({ platformExpiresAt: new Date(Date.now() - 60_000) });
    const { service } = serviceWith({ gemini: ['allow-b1'] }, () => ({ answer: 'ok' }));
    await expect(service.generateText({ accountId: ended.accountId, tag, prompt })).rejects.toMatchObject({
      status: 503,
      code: 'AI_ACCESS_ENDED',
    });
    const running = await newBusiness({ platformExpiresAt: new Date(Date.now() + 3_600_000) });
    expect((await service.generateText({ accountId: running.accountId, tag, prompt })).text).toBe('ok');
  });

  it('a business with no settings at all gets its own keys only: nothing to try without a key (503)', async () => {
    const manager = await createSignedInPerson(app, database);
    const { service } = serviceWith({ gemini: ['allow-c1'] }, () => ({ answer: 'never' }));
    await expect(service.generateText({ accountId: manager.profile.business.id, tag, prompt })).rejects.toMatchObject({
      status: 503,
      code: 'AI_NOT_AVAILABLE',
    });
  });
});

describe('the business’s own keys', () => {
  it('uses its own key, as an “own” key, and not the platform’s, in own mode', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    const { key } = await saveOwnKey(manager, 'gemini');
    const seen: Array<{ keySource: string; apiKey: string }> = [];
    const { service } = serviceWith({ gemini: ['own-a-platform'] }, (candidate) => {
      seen.push({ keySource: candidate.keySource, apiKey: candidate.apiKey });
      return { answer: 'ok' };
    });
    const result = await service.generateText({ accountId, tag, prompt });
    expect(result.details.servedBy).toMatchObject({ keySource: 'own', provider: 'gemini' });
    expect(seen).toEqual([{ keySource: 'own', apiKey: key }]);
  });

  it('never uses a key of another business', async () => {
    const mine = await newBusiness({ keyMode: 'own' });
    const other = await newBusiness({ keyMode: 'own' });
    await saveOwnKey(other.manager, 'gemini');
    const { service, llm } = serviceWith({ gemini: ['own-b-platform'] }, () => ({ answer: 'never' }));
    await expect(service.generateText({ accountId: mine.accountId, tag, prompt })).rejects.toMatchObject({
      status: 503,
    });
    expect(llm.requests).toHaveLength(0);
  });

  it('tries all its own keys first and the platform’s only when they all fail (own then platform)', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own_then_platform' });
    const first = await saveOwnKey(manager, 'gemini', 'First');
    const second = await saveOwnKey(manager, 'gemini', 'Second');
    const tried: string[] = [];
    const { service } = serviceWith({ gemini: ['own-c-platform'] }, (candidate) => {
      tried.push(`${candidate.keySource}:${candidate.modelName}`);
      if (candidate.keySource === 'own') throw new Error('API key not valid');
      return { answer: 'platform saved it' };
    });
    const result = await service.generateText({ accountId, tag, prompt });
    expect(result.text).toBe('platform saved it');
    // own keys on every model of the job come before the first platform try
    const firstPlatformTry = tried.findIndex((name) => name.startsWith('platform:'));
    expect(firstPlatformTry).toBeGreaterThan(0);
    expect(tried.slice(0, firstPlatformTry).every((name) => name.startsWith('own:'))).toBe(true);
    expect(result.details).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'bad_key',
      servedBy: { keySource: 'platform' },
    });
    expect(JSON.stringify(result.details)).not.toContain(first.key);
    expect(JSON.stringify(result.details)).not.toContain(second.key);
  });

  it('does not fall to the platform in own mode, and says so when the own keys all fail', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    await saveOwnKey(manager, 'gemini');
    const { service } = serviceWith({ gemini: ['own-d-platform'] }, (candidate) => {
      if (candidate.keySource === 'platform') return { answer: 'must not happen' };
      throw new Error('socket hang up');
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({ status: 502 });
  });

  it('notes what real use showed about a key: rejected becomes failed, and it is logged once, by the system', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    const { keyId } = await saveOwnKey(manager, 'gemini');
    const { service } = serviceWith({}, () => {
      throw new Error('API key not valid');
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    const key = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', keyId)
      .executeTakeFirstOrThrow();
    expect(key.status).toBe('failed');
    expect(key.status_note).toContain('rejected');
    expect(key.status_checked_at).not.toBeNull();
    // a second failure changes nothing, so it writes nothing more
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('kind', '=', 'ai.key_status_changed')
      .execute();
    expect(logLines).toHaveLength(1);
    expect(logLines[0]?.actor).toEqual({ kind: 'system', id: 'core.ai' });
  });

  it('marks a key working again after it answers, and limited after a quota problem', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    const { keyId } = await saveOwnKey(manager, 'gemini');
    let behaviour: 'quota' | 'ok' = 'quota';
    const { service } = serviceWith({}, () => {
      if (behaviour === 'quota') throw new Error('429 quota exceeded');
      return { answer: 'ok' };
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({ status: 429 });
    const statusOfKey = async () =>
      (await database.system.selectFrom('ai_keys').select('status').where('id', '=', keyId).executeTakeFirstOrThrow())
        .status;
    expect(await statusOfKey()).toBe('limited');
    behaviour = 'ok';
    await service.generateText({ accountId, tag, prompt });
    expect(await statusOfKey()).toBe('working');
  });

  it('does not let a problem noting key health fail the answer the customer is waiting for', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    await saveOwnKey(manager, 'gemini');
    // a database that works for reading the settings and then fails when the key's health is written
    let transactionsOpened = 0;
    const flakyDatabase: Database = {
      ...database,
      runInAccountTransaction: (id, work) => {
        transactionsOpened += 1;
        if (transactionsOpened > 1) return Promise.reject(new Error('the database went away'));
        return database.runInAccountTransaction(id, work);
      },
    };
    const problems: string[] = [];
    const service = createAiService({
      database: flakyDatabase,
      config: testConfig(),
      llm: createScriptedLlmProvider(() => ({ answer: 'still answered' })),
      recorder: { record: async () => {} }, // recording is tested elsewhere; here only the key health note may fail
      reportProblem: (what) => void problems.push(what),
    });
    // the key was never tested, so a good answer changes it to working, which is what fails to be written
    const result = await service.generateText({ accountId, tag, prompt });
    expect(result.text).toBe('still answered');
    expect(problems).toEqual(['Could not note the health of an AI key']);
  });
});

describe('the business’s own model order', () => {
  it('uses the business’s order for the job it set, and the platform’s for the other jobs', async () => {
    const [gptMini, flash] = await modelIds('gpt-4o-mini', 'gemini-3.5-flash');
    const { accountId } = await newBusiness({ taskModels: { chat_reply: [flash as string, gptMini as string] } });
    const firstModel: string[] = [];
    const { service } = serviceWith({ gemini: ['order-a1'], openai: ['order-a-open'] }, (candidate) => {
      firstModel.push(candidate.modelName);
      return { answer: 'ok' };
    });
    await service.generateText({ accountId, tag, prompt }); // chat_reply: the business's own order
    await service.generateText({ accountId, tag: { ...tag, task: 'summarise' }, prompt }); // the platform's order
    expect(firstModel).toEqual(['gemini-3.5-flash', 'gemini-flash-lite-latest']);
  });
});
