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

const prompt = { stableSystemText: 'rules', messages: [{ role: 'user' as const, text: 'hello' }] };
const tag = (task: string, agentId: string, channel: string) => ({ task, agentId, channel, promptVersion: 'p-2' });

async function newBusiness() {
  const manager = await createSignedInPerson(app, database);
  await database.system
    .insertInto('ai_settings')
    .values({ account_id: manager.profile.business.id, key_mode: 'platform', platform_enabled: true })
    .execute();
  return { manager, accountId: manager.profile.business.id };
}

function serviceWith(script: LlmScript) {
  return createAiService({
    database,
    config: { ...testConfig(), ai: { platformKeys: { gemini: [`log-${randomUUID()}`], openai: [], anthropic: [] } } },
    llm: createScriptedLlmProvider(script),
  });
}

const get = (person: SignedInPerson | null, url: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

/** Spreads the business's calls over time (the call just made is the newest), so ordering and paging are certain. */
async function spaceOutCalls(accountId: string) {
  const rows = await database.system
    .selectFrom('ai_calls')
    .select('id')
    .where('account_id', '=', accountId)
    .orderBy('created_at')
    .execute();
  for (const [index, row] of rows.entries()) {
    await database.system
      .updateTable('ai_calls')
      .set({ created_at: new Date(Date.now() - (rows.length - index) * 60_000) })
      .where('id', '=', row.id)
      .execute();
  }
}

describe('GET /api/v1/ai/calls', () => {
  it('lists the calls newest first with who answered, the tries, tokens and time', async () => {
    const { manager, accountId } = await newBusiness();
    const service = serviceWith((candidate) => {
      if (candidate.modelName === 'gemini-flash-lite-latest') throw new Error('429 quota');
      return { answer: 'ok', usage: { inputTokens: 50, outputTokens: 5, cachedTokens: 30 } };
    });
    await service.generateText({ accountId, tag: tag('chat_reply', 'webchat', 'webchat'), prompt });
    await service.generateText({
      accountId,
      tag: { ...tag('summarise', 'email', 'email'), conversationId: randomUUID() },
      prompt,
    });
    await spaceOutCalls(accountId);
    const response = await get(manager, '/ai/calls');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.items.map((item: { task: string }) => item.task)).toEqual(['summarise', 'chat_reply']);
    expect(body.nextBefore).toBeNull();
    expect(body.items[1]).toMatchObject({
      agentId: 'webchat',
      channel: 'webchat',
      promptVersion: 'p-2',
      provider: 'gemini',
      modelName: 'gemini-3.5-flash-lite',
      keySource: 'platform',
      success: true,
      attemptCount: 2,
      fallbackUsed: true,
      fallbackReason: 'rate_limited',
      inputTokens: 50,
      outputTokens: 5,
      cachedTokens: 30,
    });
    expect(body.items[1].attempts.map((attempt: { outcome: string }) => attempt.outcome)).toEqual([
      'rate_limited',
      'ok',
    ]);
    expect(body.items[1].latencyMs).toBeTypeOf('number');
    expect(body.items[0].conversationId).not.toBeNull();
  });

  it('shows failed calls with the reason, and can show only answered or only failed ones', async () => {
    const { manager, accountId } = await newBusiness();
    await serviceWith(() => ({ answer: 'ok' })).generateText({
      accountId,
      tag: tag('chat_reply', 'webchat', 'webchat'),
      prompt,
    });
    await expect(
      serviceWith(() => {
        throw new Error('API key not valid');
      }).generateText({ accountId, tag: tag('chat_reply', 'webchat', 'webchat'), prompt }),
    ).rejects.toBeDefined();
    await spaceOutCalls(accountId);
    const failed = (await get(manager, '/ai/calls?success=false')).json();
    expect(failed.items).toHaveLength(1);
    expect(failed.items[0]).toMatchObject({ success: false, errorKind: 'bad_key' });
    expect((await get(manager, '/ai/calls?success=true')).json().items).toHaveLength(1);
    expect((await get(manager, '/ai/calls')).json().items).toHaveLength(2);
  });

  it('narrows by job, agent and channel', async () => {
    const { manager, accountId } = await newBusiness();
    const service = serviceWith(() => ({ answer: 'ok' }));
    await service.generateText({ accountId, tag: tag('chat_reply', 'webchat', 'webchat'), prompt });
    await service.generateText({ accountId, tag: tag('summarise', 'email', 'email'), prompt });
    await service.generateText({ accountId, tag: tag('summarise', 'whatsapp', 'whatsapp'), prompt });
    await spaceOutCalls(accountId);
    const count = async (query: string) => (await get(manager, `/ai/calls?${query}`)).json().items.length;
    expect(await count('task=summarise')).toBe(2);
    expect(await count('agent=email')).toBe(1);
    expect(await count('channel=whatsapp')).toBe(1);
    expect(await count('task=summarise&agent=email')).toBe(1);
    expect(await count('task=nothing')).toBe(0);
  });

  it('pages back in time with limit and nextBefore, without repeating or skipping a call', async () => {
    const { manager, accountId } = await newBusiness();
    const service = serviceWith(() => ({ answer: 'ok' }));
    for (let count = 0; count < 5; count += 1) {
      await service.generateText({ accountId, tag: tag('chat_reply', `agent-${count}`, 'webchat'), prompt });
    }
    await spaceOutCalls(accountId);
    const seen: string[] = [];
    let before: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const response: { items: Array<{ agentId: string }>; nextBefore: string | null } = (
        await get(manager, `/ai/calls?limit=2${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      ).json();
      seen.push(...response.items.map((item) => item.agentId));
      before = response.nextBefore;
      if (!before) break;
    }
    expect(seen).toEqual(['agent-4', 'agent-3', 'agent-2', 'agent-1', 'agent-0']);
  });

  it('holds no message text and no key', async () => {
    const { manager, accountId } = await newBusiness();
    await serviceWith(() => ({ answer: 'ANSWER-SECRET-WORDS' })).generateText({
      accountId,
      tag: tag('chat_reply', 'webchat', 'webchat'),
      prompt: { stableSystemText: 'RULES-SECRET-WORDS', messages: [{ role: 'user', text: 'CUSTOMER-SECRET-WORDS' }] },
    });
    const response = await get(manager, '/ai/calls');
    for (const secret of ['ANSWER-SECRET-WORDS', 'RULES-SECRET-WORDS', 'CUSTOMER-SECRET-WORDS', 'log-']) {
      expect(response.body).not.toContain(secret);
    }
    expect(response.body).not.toMatch(/apiKey|encrypted/);
  });

  it('shows a business only its own calls', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    await serviceWith(() => ({ answer: 'ok' })).generateText({
      accountId: first.accountId,
      tag: tag('chat_reply', 'webchat', 'webchat'),
      prompt,
    });
    expect((await get(second.manager, '/ai/calls')).json().items).toEqual([]);
    expect((await get(first.manager, '/ai/calls')).json().items).toHaveLength(1);
  });

  it('answers 400 for a limit out of range, a bad date, a bad success value and unknown parameters', async () => {
    const { manager } = await newBusiness();
    for (const query of [
      '?limit=0',
      '?limit=201',
      '?limit=abc',
      '?before=yesterday',
      '?success=maybe',
      '?colour=red',
    ]) {
      expect((await get(manager, `/ai/calls${query}`)).statusCode, query).toBe(400);
    }
    expect((await get(manager, '/ai/calls?limit=200')).statusCode).toBe(200);
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await get(null, '/ai/calls')).statusCode).toBe(401);
    const { manager } = await newBusiness();
    await database.system
      .updateTable('users')
      .set({ role: 'staff' })
      .where('id', '=', manager.profile.user.id)
      .execute();
    expect((await get(manager, '/ai/calls')).statusCode).toBe(403);
  });
});
