import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createConversationRecordsService } from '../src/modules/core/conversations';
import { createIdleChatsService } from '../src/modules/channels/webchat/services/idle-chats.service';
import webchatModule from '../src/modules/channels/webchat/module';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

const SITE = 'https://nairstays.example';

let database: Database;
let app: FastifyInstance;
let queuedJobs: Array<{ jobName: string; data: Record<string, unknown> }> = [];

let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`webchat-end-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  app = await buildTestApp(database, [], {
    config,
    llmProvider: pretendAiCompany,
    enqueueJob: async (jobName, data) => {
      queuedJobs.push({ jobName, data });
    },
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const asStaff = (person: SignedInPerson, method: 'GET' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

const asVisitor = (
  key: string,
  method: 'GET' | 'POST' | 'OPTIONS',
  path: 'config' | 'messages' | 'end',
  options: { origin?: string; token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url: `/api/v1/public/widget/${key}/${path}`,
    headers: {
      origin: options.origin ?? SITE,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload as object }),
  });

async function newBusinessWithChat() {
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
  const settings = await asStaff(person, 'PATCH', '/channels/webchat', { allowedWebsites: [SITE] });
  return { person, accountId: person.profile.business.id, key: settings.json().widgetKey as string };
}

/** The visitor chats once; answers the token. */
async function startChat(key: string, message = 'Hello there'): Promise<string> {
  const response = await asVisitor(key, 'POST', 'messages', { payload: { message } });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().visitorToken as string;
}

const conversationOf = async (accountId: string) =>
  database.system.selectFrom('conversations').selectAll().where('account_id', '=', accountId).executeTakeFirstOrThrow();

describe('GET /api/v1/public/widget/{key}/messages (resume after a reload)', () => {
  it('gives the visitor their chat back, oldest first, and says it has not ended', async () => {
    const { key } = await newBusinessWithChat();
    script = () => ({ answer: 'Welcome!' });
    const token = await startChat(key, 'First words');
    const response = await asVisitor(key, 'GET', 'messages', { token });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.ended).toBe(false);
    expect(body.messages.map((message: { sender: string; body: string }) => [message.sender, message.body])).toEqual([
      ['customer', 'First words'],
      ['agent', 'Welcome!'],
    ]);
    expect(new Date(body.messages[0].createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(response.headers['access-control-allow-origin']).toBe(SITE);
  });

  it('refuses without a token, with a token that is not ours, and from a website that is not allowed', async () => {
    const { key } = await newBusinessWithChat();
    const token = await startChat(key);
    expect((await asVisitor(key, 'GET', 'messages')).statusCode).toBe(401);
    expect((await asVisitor(key, 'GET', 'messages', { token: 'nonsense' })).statusCode).toBe(401);
    expect((await asVisitor(key, 'GET', 'messages', { token, origin: 'https://evil.example' })).statusCode).toBe(403);
  });

  it('never gives one business’s chat to another business’s key, or a test chat to anyone', async () => {
    const first = await newBusinessWithChat();
    const second = await newBusinessWithChat();
    const tokenOfFirst = await startChat(first.key, 'Private words of the first');
    const crossed = await asVisitor(second.key, 'GET', 'messages', { token: tokenOfFirst });
    expect(crossed.statusCode).toBe(401);
    expect(crossed.body).not.toContain('Private words');
  });

  it('answers 404 while the chat is switched off', async () => {
    const { person, key } = await newBusinessWithChat();
    const token = await startChat(key);
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    expect((await asVisitor(key, 'GET', 'messages', { token })).statusCode).toBe(404);
  });
});

describe('POST /api/v1/public/widget/{key}/end (the visitor closes the bubble)', () => {
  it('ends the chat, queues the sorting and the summary once, and the chat shows as ended', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const token = await startChat(key);
    const conversation = await conversationOf(accountId);
    queuedJobs = [];
    const response = await asVisitor(key, 'POST', 'end', { token });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ ended: true });
    expect(queuedJobs).toEqual([
      { jobName: 'conversations.sort_conversation', data: { accountId, conversationId: conversation.id } },
      { jobName: 'agents.summarise_conversation', data: { accountId, conversationId: conversation.id } },
    ]);
    expect((await conversationOf(accountId)).ended_at).not.toBeNull();
    expect((await asVisitor(key, 'GET', 'messages', { token })).json().ended).toBe(true);
  });

  it('does nothing the second time: closing twice queues nothing more', async () => {
    const { key } = await newBusinessWithChat();
    const token = await startChat(key);
    await asVisitor(key, 'POST', 'end', { token });
    queuedJobs = [];
    const again = await asVisitor(key, 'POST', 'end', { token });
    expect(again.statusCode).toBe(200);
    expect(queuedJobs).toEqual([]);
  });

  it('lets the next message start a new chat after the end', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const token = await startChat(key);
    await asVisitor(key, 'POST', 'end', { token });
    const next = await asVisitor(key, 'POST', 'messages', { token, payload: { message: 'Hello again' } });
    expect(next.statusCode).toBe(200);
    expect(next.json().newChat).toBe(true);
    const count = await database.system
      .selectFrom('conversations')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(Number(count.total)).toBe(2);
  });

  it('refuses without a good token, another business’s token, and a website that is not allowed (and ends nothing)', async () => {
    const first = await newBusinessWithChat();
    const second = await newBusinessWithChat();
    const token = await startChat(first.key);
    queuedJobs = [];
    expect((await asVisitor(first.key, 'POST', 'end')).statusCode).toBe(401);
    expect((await asVisitor(first.key, 'POST', 'end', { token: 'nonsense' })).statusCode).toBe(401);
    expect((await asVisitor(second.key, 'POST', 'end', { token })).statusCode).toBe(401);
    expect((await asVisitor(first.key, 'POST', 'end', { token, origin: 'https://evil.example' })).statusCode).toBe(403);
    expect(queuedJobs).toEqual([]);
    expect((await conversationOf(first.accountId)).ended_at).toBeNull();
  });

  it('answers the browser’s permission check for the allowed website only', async () => {
    const { key } = await newBusinessWithChat();
    const allowed = await asVisitor(key, 'OPTIONS', 'end');
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(SITE);
    const refused = await asVisitor(key, 'OPTIONS', 'end', { origin: 'https://evil.example' });
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('ending chats after 15 minutes of silence', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  let queued: Array<{ jobName: string; data: Record<string, unknown> }> = [];
  const idleChats = () =>
    createIdleChatsService({
      database,
      enqueueJob: async (jobName, data) => {
        queued.push({ jobName, data });
      },
    });

  /** A chat with one customer message, last active the given number of minutes ago. */
  async function chatLastActive(
    accountId: string,
    minutes: number,
    options: { channel?: 'webchat' | 'email'; isTest?: boolean; ended?: boolean; sorted?: boolean } = {},
  ): Promise<string> {
    const records = createConversationRecordsService({ database });
    const conversationId = await records.startConversation(accountId, {
      channel: options.channel ?? 'webchat',
      isTest: options.isTest ?? false,
    });
    await records.addMessage(accountId, conversationId, { sender: 'customer', body: 'Hello' });
    await database.system
      .updateTable('conversation_messages')
      .set({ created_at: minutesAgo(minutes) })
      .where('conversation_id', '=', conversationId)
      .execute();
    await database.system
      .updateTable('conversations')
      .set({
        created_at: minutesAgo(minutes),
        ...(options.ended ? { ended_at: minutesAgo(minutes - 1) } : {}),
        ...(options.sorted
          ? {
              status: 'sorted',
              type_key: 'general_enquiry',
              type_source: 'rule',
              sorted_at: minutesAgo(minutes - 1),
              ended_at: minutesAgo(minutes - 1),
            }
          : {}),
      })
      .where('id', '=', conversationId)
      .execute();
    return conversationId;
  }

  it('ends a chat quiet for more than 15 minutes, queues its sorting and summary, and leaves the others alone', async () => {
    const { accountId } = await newBusinessWithChat();
    queued = [];
    const idle = await chatLastActive(accountId, 20);
    const recent = await chatLastActive(accountId, 5);
    const testChat = await chatLastActive(accountId, 20, { isTest: true });
    const emailChat = await chatLastActive(accountId, 20, { channel: 'email' });
    const alreadyEnded = await chatLastActive(accountId, 30, { ended: true });
    const alreadySorted = await chatLastActive(accountId, 30, { sorted: true });

    expect(await idleChats().findBusinessesWithIdleChats()).toContain(accountId);
    expect(await idleChats().endIdleChatsOfBusiness(accountId)).toBe(1);

    expect(queued).toEqual([
      { jobName: 'conversations.sort_conversation', data: { accountId, conversationId: idle } },
      { jobName: 'agents.summarise_conversation', data: { accountId, conversationId: idle } },
    ]);
    const endedAt = async (conversationId: string) =>
      (
        await database.system
          .selectFrom('conversations')
          .select('ended_at')
          .where('id', '=', conversationId)
          .executeTakeFirstOrThrow()
      ).ended_at;
    expect(await endedAt(idle)).not.toBeNull();
    expect(await endedAt(recent)).toBeNull();
    expect(await endedAt(testChat)).toBeNull();
    expect(await endedAt(emailChat)).toBeNull();
    expect(await endedAt(alreadyEnded)).not.toBeNull();
    expect(await endedAt(alreadySorted)).not.toBeNull();
  });

  it('is safe to run twice: the second run finds nothing and queues nothing', async () => {
    const { accountId } = await newBusinessWithChat();
    await chatLastActive(accountId, 20);
    expect(await idleChats().endIdleChatsOfBusiness(accountId)).toBe(1);
    queued = [];
    expect(await idleChats().endIdleChatsOfBusiness(accountId)).toBe(0);
    expect(queued).toEqual([]);
    expect(await idleChats().findBusinessesWithIdleChats()).not.toContain(accountId);
  });

  it('counts the last message, not the start: a long chat that is still going is not ended', async () => {
    const { accountId } = await newBusinessWithChat();
    const conversationId = await chatLastActive(accountId, 60);
    await createConversationRecordsService({ database }).addMessage(accountId, conversationId, {
      sender: 'customer',
      body: 'Still here',
    });
    expect(await idleChats().endIdleChatsOfBusiness(accountId)).toBe(0);
  });

  it('only touches the business it is run for', async () => {
    const first = await newBusinessWithChat();
    const second = await newBusinessWithChat();
    await chatLastActive(first.accountId, 20);
    const otherBusinessChat = await chatLastActive(second.accountId, 20);
    expect(await idleChats().endIdleChatsOfBusiness(first.accountId)).toBe(1);
    const row = await database.system
      .selectFrom('conversations')
      .select('ended_at')
      .where('id', '=', otherBusinessChat)
      .executeTakeFirstOrThrow();
    expect(row.ended_at).toBeNull();
  });

  it('is declared by the module as a job every minute, and the per-business job has no schedule of its own', () => {
    const jobs = webchatModule.jobs ?? [];
    expect(jobs.find((job) => job.name === 'webchat.find_idle_chats')?.schedule).toBe('* * * * *');
    expect(jobs.find((job) => job.name === 'webchat.end_idle_chats')?.schedule).toBeUndefined();
  });
});
