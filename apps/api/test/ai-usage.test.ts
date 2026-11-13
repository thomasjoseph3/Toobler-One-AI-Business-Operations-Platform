import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createAiService } from '../src/modules/core/ai';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
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

const tag = { task: 'chat_reply', agentId: 'webchat', channel: 'webchat', promptVersion: 'p-1' };
const prompt = { stableSystemText: 'rules', messages: [{ role: 'user' as const, text: 'hello' }] };

async function newBusiness(
  setup: {
    keyMode?: 'own' | 'platform' | 'own_then_platform';
    cap?: number | null;
    expiresAt?: Date | null;
    enabled?: boolean;
  } = {},
) {
  const manager = await createSignedInPerson(app, database);
  await database.system
    .insertInto('ai_settings')
    .values({
      account_id: manager.profile.business.id,
      key_mode: setup.keyMode ?? 'platform',
      platform_enabled: setup.enabled ?? true,
      platform_monthly_call_cap: setup.cap ?? null,
      platform_expires_at: setup.expiresAt ?? null,
    })
    .execute();
  return { manager, accountId: manager.profile.business.id };
}

/** An AI service with its own made-up platform keys (unique per call so pools never leak between tests) and a pretend AI. */
function serviceWith(script: LlmScript, platformKeys: { gemini?: string[] } = { gemini: [`usage-${randomUUID()}`] }) {
  return createAiService({
    database,
    config: { ...testConfig(), ai: { platformKeys: { gemini: platformKeys.gemini ?? [], openai: [], anthropic: [] } } },
    llm: createScriptedLlmProvider(script),
  });
}

const get = (person: SignedInPerson | null, url: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

async function setRole(person: SignedInPerson, role: 'manager' | 'staff') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('recording every call', () => {
  it('writes one call record and adds the call to the day’s totals', async () => {
    const { accountId } = await newBusiness();
    const service = serviceWith(() => ({
      answer: 'hi',
      usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 40 },
    }));
    await service.generateText({ accountId, tag: { ...tag, conversationId: randomUUID() }, prompt });
    const calls = await database.system
      .selectFrom('ai_calls')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      task: 'chat_reply',
      agent_id: 'webchat',
      channel: 'webchat',
      prompt_version: 'p-1',
      provider: 'gemini',
      model_name: 'gemini-flash-lite-latest',
      key_source: 'platform',
      success: true,
      error_kind: null,
      attempt_count: 1,
      fallback_used: false,
      input_tokens: 100,
      output_tokens: 10,
      cached_tokens: 40,
    });
    const usage = await database.system
      .selectFrom('ai_usage')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ calls: 1, failures: 0, fallbacks: 0, input_tokens: 100, cached_tokens: 40 });
  });

  it('adds up calls of the same kind in one daily row, and keeps different agents apart', async () => {
    const { accountId } = await newBusiness();
    const service = serviceWith(() => ({ answer: 'hi', usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0 } }));
    await service.generateText({ accountId, tag, prompt });
    await service.generateText({ accountId, tag, prompt });
    await service.generateText({ accountId, tag: { ...tag, agentId: 'email', channel: 'email' }, prompt });
    const usage = await database.system
      .selectFrom('ai_usage')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('agent_id')
      .execute();
    expect(usage.map((row) => `${row.agent_id}:${row.calls}`)).toEqual(['email:1', 'webchat:2']);
    expect(usage.find((row) => row.agent_id === 'webchat')?.input_tokens).toBe(20);
  });

  it('records a call where every try failed as a failure with the reason, counted apart from answered calls', async () => {
    const { accountId } = await newBusiness();
    const service = serviceWith(() => {
      throw new Error('API key not valid');
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    const call = await database.system
      .selectFrom('ai_calls')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(call).toMatchObject({ success: false, error_kind: 'bad_key', input_tokens: 0 });
    const usage = await database.system
      .selectFrom('ai_usage')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(usage).toMatchObject({ calls: 0, failures: 1 });
  });

  it('records a fallback with its reason', async () => {
    const { accountId } = await newBusiness();
    const service = serviceWith((candidate) => {
      if (candidate.modelName === 'gemini-flash-lite-latest') throw new Error('429 quota exceeded');
      return { answer: 'ok' };
    });
    await service.generateText({ accountId, tag, prompt });
    const call = await database.system
      .selectFrom('ai_calls')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(call).toMatchObject({
      fallback_used: true,
      fallback_reason: 'rate_limited',
      model_name: 'gemini-3.5-flash-lite',
    });
    expect(call.attempt_count).toBe(2);
    const usage = await database.system
      .selectFrom('ai_usage')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(usage.fallbacks).toBe(1);
  });

  it('keeps no message text and no key anywhere in the call record', async () => {
    const { accountId } = await newBusiness();
    const secretKey = `usage-secret-${randomUUID()}`;
    const service = serviceWith(() => ({ answer: 'ANSWER-WORDS-SECRET' }), { gemini: [secretKey] });
    await service.generateText({
      accountId,
      tag,
      prompt: { stableSystemText: 'STABLE-RULES-SECRET', messages: [{ role: 'user', text: 'CUSTOMER-WORDS-SECRET' }] },
    });
    const everything =
      JSON.stringify(
        await database.system.selectFrom('ai_calls').selectAll().where('account_id', '=', accountId).execute(),
      ) +
      JSON.stringify(
        await database.system.selectFrom('ai_usage').selectAll().where('account_id', '=', accountId).execute(),
      );
    for (const secret of ['ANSWER-WORDS-SECRET', 'STABLE-RULES-SECRET', 'CUSTOMER-WORDS-SECRET', secretKey]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('does not let the app role change or delete a call record', async () => {
    const { accountId } = await newBusiness();
    await serviceWith(() => ({ answer: 'hi' })).generateText({ accountId, tag, prompt });
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.updateTable('ai_calls').set({ success: false }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(accountId, (transaction) => transaction.deleteFrom('ai_calls').execute()),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(accountId, (transaction) => transaction.deleteFrom('ai_usage').execute()),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('the monthly cap on the platform’s keys', () => {
  it('lets a business use exactly its cap, then refuses with 402 AI_CAP_REACHED', async () => {
    const { accountId } = await newBusiness({ cap: 2 });
    const service = serviceWith(() => ({ answer: 'ok' }));
    await service.generateText({ accountId, tag, prompt });
    await service.generateText({ accountId, tag, prompt });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({
      status: 402,
      code: 'AI_CAP_REACHED',
    });
  });

  it('counts answered calls only: failed calls cost the platform nothing', async () => {
    const { accountId } = await newBusiness({ cap: 1 });
    const failing = serviceWith(() => {
      throw new Error('socket hang up');
    });
    await expect(failing.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    await expect(failing.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    const working = serviceWith(() => ({ answer: 'ok' }));
    expect((await working.generateText({ accountId, tag, prompt })).text).toBe('ok');
    await expect(working.generateText({ accountId, tag, prompt })).rejects.toMatchObject({ code: 'AI_CAP_REACHED' });
  });

  it('a cap of zero allows nothing, and no cap allows everything', async () => {
    const zero = await newBusiness({ cap: 0 });
    await expect(
      serviceWith(() => ({ answer: 'ok' })).generateText({ accountId: zero.accountId, tag, prompt }),
    ).rejects.toMatchObject({
      code: 'AI_CAP_REACHED',
    });
    const unlimited = await newBusiness({ cap: null });
    const service = serviceWith(() => ({ answer: 'ok' }));
    for (let count = 0; count < 5; count += 1)
      await service.generateText({ accountId: unlimited.accountId, tag, prompt });
  });

  it('counts only this month’s calls: last month’s do not use up this month’s cap', async () => {
    const { accountId } = await newBusiness({ cap: 1 });
    await database.system
      .insertInto('ai_usage')
      .values({
        account_id: accountId,
        day: '2020-01-15',
        provider: 'gemini',
        model_name: 'gemini-flash-lite-latest',
        task: 'chat_reply',
        agent_id: 'webchat',
        channel: 'webchat',
        key_source: 'platform',
        calls: 999,
      })
      .execute();
    expect((await serviceWith(() => ({ answer: 'ok' })).generateText({ accountId, tag, prompt })).text).toBe('ok');
  });

  it('counts the platform’s keys only: a business’s own keys are not capped', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own_then_platform', cap: 1 });
    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/keys',
      headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
      payload: { provider: 'gemini', label: 'Own', key: `AIzaSyOwnCap${randomUUID().replace(/-/g, '')}` },
    });
    const service = serviceWith(() => ({ answer: 'ok' }));
    for (let count = 0; count < 4; count += 1) {
      expect((await service.generateText({ accountId, tag, prompt })).details.servedBy.keySource).toBe('own');
    }
    const usage = await database.system
      .selectFrom('ai_usage')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(usage.every((row) => row.key_source === 'own')).toBe(true);
  });

  it('keeps answering from the business’s own keys when the cap is reached in own-then-platform mode', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own_then_platform', cap: 0 });
    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/keys',
      headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
      payload: { provider: 'gemini', label: 'Own', key: `AIzaSyOwnCap2${randomUUID().replace(/-/g, '')}` },
    });
    const result = await serviceWith(() => ({ answer: 'ok' })).generateText({ accountId, tag, prompt });
    expect(result.details.servedBy.keySource).toBe('own');
  });

  it('works again when the platform raises the cap', async () => {
    const { accountId } = await newBusiness({ cap: 1 });
    const service = serviceWith(() => ({ answer: 'ok' }));
    await service.generateText({ accountId, tag, prompt });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toMatchObject({ code: 'AI_CAP_REACHED' });
    await database.system
      .updateTable('ai_settings')
      .set({ platform_monthly_call_cap: 5 })
      .where('account_id', '=', accountId)
      .execute();
    expect((await service.generateText({ accountId, tag, prompt })).text).toBe('ok');
  });

  it('does not let a problem recording the call fail the answer', async () => {
    const { accountId } = await newBusiness();
    const problems: string[] = [];
    const service = createAiService({
      database,
      config: { ...testConfig(), ai: { platformKeys: { gemini: [`rec-${randomUUID()}`], openai: [], anthropic: [] } } },
      llm: createScriptedLlmProvider(() => ({ answer: 'still answered' })),
      recorder: {
        record: async () => {
          throw new Error('the database went away');
        },
      },
      reportProblem: (what) => void problems.push(what),
    });
    expect((await service.generateText({ accountId, tag, prompt })).text).toBe('still answered');
    expect(problems).toEqual(['Could not record an AI call']);
  });
});

describe('GET /api/v1/ai/usage', () => {
  it('shows zeros for a business that has used nothing, and the platform’s part', async () => {
    const { manager } = await newBusiness({ cap: 100 });
    const response = await get(manager, '/ai/usage');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().totals).toEqual({
      calls: 0,
      failures: 0,
      fallbacks: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cacheHitRate: 0,
    });
    expect(response.json().groups).toEqual([]);
    expect(response.json().groupBy).toBeNull();
    expect(response.json().platform).toMatchObject({
      enabled: true,
      monthlyCallCap: 100,
      usedThisMonth: 0,
      remainingThisMonth: 100,
      expiresAt: null,
    });
  });

  it('adds up tokens and the cache hit rate, and shows the cap used and left', async () => {
    const { manager, accountId } = await newBusiness({ cap: 10 });
    const service = serviceWith(() => ({
      answer: 'ok',
      usage: { inputTokens: 200, outputTokens: 20, cachedTokens: 150 },
    }));
    for (let count = 0; count < 3; count += 1) await service.generateText({ accountId, tag, prompt });
    const body = (await get(manager, '/ai/usage')).json();
    expect(body.totals).toEqual({
      calls: 3,
      failures: 0,
      fallbacks: 0,
      inputTokens: 600,
      outputTokens: 60,
      cachedTokens: 450,
      cacheHitRate: 0.75,
    });
    expect(body.platform).toMatchObject({ usedThisMonth: 3, remainingThisMonth: 7 });
  });

  it('splits by job, agent, channel, model and day', async () => {
    const { manager, accountId } = await newBusiness();
    const service = serviceWith(() => ({ answer: 'ok', usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 5 } }));
    await service.generateText({ accountId, tag, prompt });
    await service.generateText({
      accountId,
      tag: { ...tag, task: 'summarise', agentId: 'email', channel: 'email' },
      prompt,
    });
    await service.generateText({
      accountId,
      tag: { ...tag, task: 'summarise', agentId: 'email', channel: 'email' },
      prompt,
    });
    const keys = async (groupBy: string) =>
      Object.fromEntries(
        (await get(manager, `/ai/usage?groupBy=${groupBy}`))
          .json()
          .groups.map((group: { key: string; calls: number }) => [group.key, group.calls]),
      );
    expect(await keys('task')).toEqual({ chat_reply: 1, summarise: 2 });
    expect(await keys('agent')).toEqual({ email: 2, webchat: 1 });
    expect(await keys('channel')).toEqual({ email: 2, webchat: 1 });
    expect(await keys('model')).toEqual({ 'gemini:gemini-flash-lite-latest': 3 });
    const today = new Date().toISOString().slice(0, 10);
    expect(await keys('day')).toEqual({ [today]: 3 });
    const grouped = (await get(manager, '/ai/usage?groupBy=agent')).json();
    expect(grouped.groupBy).toBe('agent');
    expect(grouped.groups.find((group: { key: string }) => group.key === 'email')).toMatchObject({
      cacheHitRate: 0.5,
      inputTokens: 20,
    });
  });

  it('answers for the range asked, and leaves out days outside it', async () => {
    const { manager, accountId } = await newBusiness();
    const insertDay = (day: string, calls: number) =>
      database.system
        .insertInto('ai_usage')
        .values({
          account_id: accountId,
          day,
          provider: 'gemini',
          model_name: 'm',
          task: 'chat_reply',
          agent_id: 'webchat',
          channel: 'webchat',
          key_source: 'own',
          calls,
        })
        .execute();
    await insertDay('2026-09-30', 1);
    await insertDay('2026-10-01', 10);
    await insertDay('2026-10-31', 100);
    await insertDay('2026-11-01', 1000);
    const october = (await get(manager, '/ai/usage?from=2026-10-01&to=2026-10-31')).json();
    expect(october).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(october.totals.calls).toBe(110);
    const byDay = (await get(manager, '/ai/usage?from=2026-10-01&to=2026-10-31&groupBy=day')).json();
    expect(byDay.groups.map((group: { key: string }) => group.key)).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('answers 400 for a range that is not real days, runs backwards or is over a year, and for bad parameters', async () => {
    const { manager } = await newBusiness();
    for (const query of [
      '?from=2026-02-31',
      '?from=yesterday',
      '?from=2026-11-10&to=2026-11-01',
      '?from=2024-01-01&to=2026-11-01',
      '?groupBy=colour',
      '?extra=1',
    ]) {
      expect((await get(manager, `/ai/usage${query}`)).statusCode, query).toBe(400);
    }
    expect((await get(manager, '/ai/usage?from=2026-02-31')).json().error.code).toBe('INVALID_RANGE');
  });

  it('shows a business only its own usage', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    await serviceWith(() => ({ answer: 'ok' })).generateText({ accountId: first.accountId, tag, prompt });
    expect((await get(second.manager, '/ai/usage')).json().totals.calls).toBe(0);
    expect((await get(first.manager, '/ai/usage')).json().totals.calls).toBe(1);
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await get(null, '/ai/usage')).statusCode).toBe(401);
    const { manager } = await newBusiness();
    await setRole(manager, 'staff');
    expect((await get(manager, '/ai/usage')).statusCode).toBe(403);
  });
});

describe('GET /api/v1/ai/status', () => {
  it('shows each job’s expected first model, and nothing running yet', async () => {
    const { manager } = await newBusiness();
    const body = (await get(manager, '/ai/status')).json();
    expect(body.tasks).toHaveLength(7);
    // the app under test has no platform keys of its own, so nothing is expected; the shape is still complete
    expect(body.tasks[0]).toMatchObject({
      taskId: 'classify_conversation',
      lastAnswer: null,
      runningOnFallback: false,
    });
    expect(body.restingKeys).toEqual([]);
  });

  it('shows what answered last, and that a job is running on a fallback when the first choice failed', async () => {
    const { manager, accountId } = await newBusiness();
    const service = serviceWith((candidate) => {
      if (candidate.modelName === 'gemini-flash-lite-latest') throw new Error('503 high demand');
      return { answer: 'ok' };
    });
    await service.generateText({ accountId, tag, prompt });
    const status = (await get(manager, '/ai/status')).json();
    const chat = status.tasks.find((task: { taskId: string }) => task.taskId === 'chat_reply');
    expect(chat.lastAnswer).toMatchObject({
      provider: 'gemini',
      modelName: 'gemini-3.5-flash-lite',
      keySource: 'platform',
      fallbackUsed: true,
      fallbackReason: 'rate_limited',
    });
    expect(chat.runningOnFallback).toBe(true);
    const sorting = status.tasks.find((task: { taskId: string }) => task.taskId === 'classify_conversation');
    expect(sorting.lastAnswer).toBeNull();
    expect(sorting.runningOnFallback).toBe(false);
  });

  it('stops saying “on a fallback” once the last answer is older than an hour', async () => {
    const { manager, accountId } = await newBusiness();
    await serviceWith((candidate) => {
      if (candidate.modelName === 'gemini-flash-lite-latest') throw new Error('429 quota');
      return { answer: 'ok' };
    }).generateText({ accountId, tag, prompt });
    await database.system
      .updateTable('ai_calls')
      .set({ created_at: new Date(Date.now() - 2 * 3_600_000) })
      .where('account_id', '=', accountId)
      .execute();
    const chat = (await get(manager, '/ai/status'))
      .json()
      .tasks.find((task: { taskId: string }) => task.taskId === 'chat_reply');
    expect(chat.lastAnswer).not.toBeNull();
    expect(chat.runningOnFallback).toBe(false);
  });

  it('shows the business’s own keys that are resting after a limit, by label and position, never by key', async () => {
    const { manager, accountId } = await newBusiness({ keyMode: 'own' });
    const ownKey = `AIzaSyResting${randomUUID().replace(/-/g, '')}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/keys',
      headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
      payload: { provider: 'gemini', label: 'Resting one', key: ownKey },
    });
    const service = serviceWith(() => {
      throw new Error('429 quota exceeded per day');
    });
    await expect(service.generateText({ accountId, tag, prompt })).rejects.toBeDefined();
    const response = await get(manager, '/ai/status');
    const resting = response.json().restingKeys;
    expect(resting.length).toBeGreaterThan(0);
    expect(resting[0]).toMatchObject({ keySource: 'own', provider: 'gemini', keyLabel: 'Resting one', keyPosition: 1 });
    expect(typeof resting[0].until).toBe('string');
    expect(response.body).not.toContain(ownKey);
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await get(null, '/ai/status')).statusCode).toBe(401);
    const { manager } = await newBusiness();
    await setRole(manager, 'staff');
    expect((await get(manager, '/ai/status')).statusCode).toBe(403);
  });
});
