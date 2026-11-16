import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import type { JobRun } from '../src/kernel/jobs/jobs';
import agentsModule from '../src/modules/core/agents/module';
import conversationsModule from '../src/modules/core/conversations/module';
import webchatModule from '../src/modules/channels/webchat/module';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// The whole story of the website chat, the way a business lives it: a visitor chats on the business's website, goes quiet, and the chat is
// ended, sorted and summarised by the background jobs, ending in a contact and a lead (an enquiry) or a ticket (a complaint).

const SITE = 'https://nairstays.example';

let database: Database;
let app: FastifyInstance;
/** The jobs the app asked to queue, in order. The test runs them itself, the way the job runner would. */
let queuedJobs: Array<{ jobName: string; data: Record<string, unknown> }> = [];

/** What the pretend AI does for each kind of task. A chapter sets what the agent says and how the conversation is sorted. */
let agentScript: LlmScript = () => ({ answer: 'Hello!' });
let sortedAs = 'new_enquiry';
const pretendAiCompany = createScriptedLlmProvider((candidate, request, messagesSoFar) => {
  if (request.tag.task === 'classify_conversation') {
    return {
      answer: {
        primary: { type: sortedAs, confidence: 0.93 },
        secondary: [],
        needsPerson: false,
        reason: 'Because of what the visitor asked.',
      },
    };
  }
  if (request.tag.task === 'summarise')
    return { answer: 'The visitor chatted with the assistant and left a phone number.' };
  return agentScript(candidate, request, messagesSoFar);
});

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`webchat-journey-${randomUUID()}`], openai: [], anthropic: [] } },
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
  method: 'GET' | 'POST',
  path: 'config' | 'messages' | 'end',
  token?: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1/public/widget/${key}/${path}`,
    headers: { origin: SITE, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A pretend AI that asks for the given tools in its first round and then says the given words. */
const asksThenSays =
  (toolCalls: { name: string; input: unknown }[], words: string): LlmScript =>
  (_candidate, _request, messagesSoFar = []) =>
    messagesSoFar.some((message) => message.kind === 'tool_answer') ? { answer: words } : { answer: { toolCalls } };

/** Runs every job that was queued, the way the job runner would, in the order queued (a job may queue more). */
async function runQueuedJobs(accountId: string) {
  const definitions = [
    ...(agentsModule.jobs ?? []),
    ...(conversationsModule.jobs ?? []),
    ...(webchatModule.jobs ?? []),
  ];
  while (queuedJobs.length > 0) {
    const { jobName, data } = queuedJobs.shift() as (typeof queuedJobs)[number];
    const definition = definitions.find((job) => job.name === jobName);
    if (!definition) throw new Error(`No module declares the job ${jobName}`);
    await definition.run({
      data,
      accountContext: app.kernel.contextFor(accountId, { kind: 'system', id: jobName }),
      enqueueJob: async (nextJobName, nextData) => {
        queuedJobs.push({ jobName: nextJobName, data: nextData });
      },
      listAccountIds: async () => [accountId],
      logger: console as never,
      services: { config: app.kernel.config, database, mail: undefined as never, llm: app.kernel.llm },
    } satisfies JobRun);
  }
}

async function newBusinessWithChat() {
  const person = await createSignedInPerson(app, database);
  const accountId = person.profile.business.id;
  await database.system.updateTable('accounts').set({ industry: 'general' }).where('id', '=', accountId).execute();
  await database.system
    .insertInto('ai_settings')
    .values({
      account_id: accountId,
      key_mode: 'platform',
      platform_enabled: true,
      platform_expires_at: null,
      task_models: {},
    })
    .execute();
  await asStaff(person, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
  const settings = await asStaff(person, 'PATCH', '/channels/webchat', { allowedWebsites: [SITE] });
  return { person, accountId, key: settings.json().widgetKey as string };
}

/** What a business has, counted from the database. */
async function countsOf(accountId: string) {
  const count = async (table: 'contacts' | 'leads' | 'tickets') =>
    (await database.system.selectFrom(table).select('id').where('account_id', '=', accountId).execute()).length;
  return { contacts: await count('contacts'), leads: await count('leads'), tickets: await count('tickets') };
}

describe('the website chat, from the first message to the lead', () => {
  it('chapter 1: a visitor asks about a stay and leaves a number; the chat is left quiet for 15 minutes; a contact, a lead and a summary exist', async () => {
    const { person, accountId, key } = await newBusinessWithChat();
    queuedJobs = [];
    sortedAs = 'new_enquiry';

    // The bubble asks how to look, then the visitor chats
    expect((await asVisitor(key, 'GET', 'config')).statusCode).toBe(200);
    agentScript = () => ({ answer: 'Welcome! Which dates are you thinking of?' });
    const first = (
      await asVisitor(key, 'POST', 'messages', undefined, { message: 'Hi, do you have a room next weekend?' })
    ).json();
    agentScript = asksThenSays(
      [
        {
          name: 'save_details',
          input: { name: 'Ravi Menon', phone: '98470 12345', interestedIn: 'a room next weekend' },
        },
      ],
      'Thank you, Ravi. Our team will call you within 15 minutes.',
    );
    const second = await asVisitor(key, 'POST', 'messages', first.visitorToken, {
      message: "I'm Ravi, 98470 12345, please call me",
    });
    expect(second.statusCode, second.body).toBe(200);

    // The page is reloaded: the chat is still there
    const resumed = (await asVisitor(key, 'GET', 'messages', first.visitorToken)).json();
    expect(resumed.messages).toHaveLength(4);

    // Nothing has made a contact or a lead yet (the chat is still open)
    expect(await countsOf(accountId)).toEqual({ contacts: 0, leads: 0, tickets: 0 });
    const [conversation] = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(conversation).toMatchObject({ from_phone_key: '919847012345', ended_at: null, status: 'open' });

    // The visitor goes quiet: 16 minutes pass, and the minute-by-minute job notices
    await database.system
      .updateTable('conversation_messages')
      .set({ created_at: new Date(Date.now() - 16 * 60_000) })
      .where('account_id', '=', accountId)
      .execute();
    const findIdleChats = webchatModule.jobs?.find((job) => job.name === 'webchat.find_idle_chats');
    await findIdleChats?.run({
      data: {},
      accountContext: undefined,
      enqueueJob: async (jobName, data) => {
        queuedJobs.push({ jobName, data });
      },
      listAccountIds: async () => [accountId],
      logger: console as never,
      services: { config: app.kernel.config, database, mail: undefined as never, llm: app.kernel.llm },
    });
    // The job looks across every business (other test files' businesses may have quiet chats too), so only this business's job is kept
    queuedJobs = queuedJobs.filter((job) => job.data.accountId === accountId);
    expect(queuedJobs.map((job) => job.jobName)).toEqual(['webchat.end_idle_chats']);
    await runQueuedJobs(accountId);

    // The chat is ended and sorted, a contact and a lead exist, and the conversation has its summary
    const [sorted] = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(sorted).toMatchObject({ status: 'sorted', type_key: 'new_enquiry' });
    expect(sorted?.ended_at).not.toBeNull();
    expect(await countsOf(accountId)).toEqual({ contacts: 1, leads: 1, tickets: 0 });
    const contact = await database.system
      .selectFrom('contacts')
      .select(['phone_key'])
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(contact.phone_key).toBe('919847012345');
    const facts = await database.system
      .selectFrom('conversation_facts')
      .select(['summary'])
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(facts.summary).toContain('left a phone number');

    // The manager sees the lead
    const leads = (await asStaff(person, 'GET', '/leads')).json();
    expect(leads.total).toBe(1);

    // The old token no longer carries on the ended chat: the next message starts a new one
    agentScript = () => ({ answer: 'Welcome back!' });
    const again = await asVisitor(key, 'POST', 'messages', first.visitorToken, { message: 'Hello again' });
    expect(again.json().newChat).toBe(true);
  });

  it('chapter 2: a visitor who closes the chat with a complaint gets a ticket and no lead', async () => {
    const { accountId, key } = await newBusinessWithChat();
    queuedJobs = [];
    sortedAs = 'complaint';
    agentScript = asksThenSays(
      [{ name: 'save_details', input: { name: 'Meera', phone: '99461 22334' } }],
      'I am sorry to hear that, Meera. I have passed this to the manager, who will contact you.',
    );
    const chat = (
      await asVisitor(key, 'POST', 'messages', undefined, {
        message: 'The AC in room 12 is broken. Meera, 99461 22334',
      })
    ).json();

    // The visitor closes the chat themselves: both jobs are queued at once
    expect((await asVisitor(key, 'POST', 'end', chat.visitorToken)).statusCode).toBe(200);
    expect(queuedJobs.map((job) => job.jobName)).toEqual([
      'conversations.sort_conversation',
      'agents.summarise_conversation',
    ]);
    await runQueuedJobs(accountId);

    expect(await countsOf(accountId)).toEqual({ contacts: 1, leads: 0, tickets: 1 });
    const [conversation] = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(conversation).toMatchObject({ status: 'sorted', type_key: 'complaint', from_phone_key: '919946122334' });
  });

  it('chapter 3: a chat that never gave a phone or an email stays anonymous and makes no lead (the sorting waits for a person)', async () => {
    const { accountId, key } = await newBusinessWithChat();
    queuedJobs = [];
    sortedAs = 'new_enquiry';
    agentScript = () => ({ answer: 'We are open every day. Would you like to book a room?' });
    const chat = (
      await asVisitor(key, 'POST', 'messages', undefined, { message: 'What are your opening hours?' })
    ).json();
    await asVisitor(key, 'POST', 'end', chat.visitorToken);
    await runQueuedJobs(accountId);

    expect((await countsOf(accountId)).leads).toBe(0);
    const [conversation] = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(conversation).toMatchObject({
      status: 'sorted',
      from_phone_key: null,
      from_email: null,
      needs_person: true,
    });
  });

  it('chapter 4: with the chat switched off nothing works for visitors, and no idle chat is ended; switched back on, it all carries on', async () => {
    const { person, accountId, key } = await newBusinessWithChat();
    queuedJobs = [];
    agentScript = () => ({ answer: 'Hello!' });
    const chat = (await asVisitor(key, 'POST', 'messages', undefined, { message: 'Hi' })).json();
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    for (const [method, path] of [
      ['GET', 'config'],
      ['POST', 'messages'],
      ['POST', 'end'],
    ] as const) {
      expect(
        (
          await asVisitor(
            key,
            method,
            path,
            chat.visitorToken,
            method === 'POST' && path === 'messages' ? { message: 'Hi' } : undefined,
          )
        ).statusCode,
      ).toBe(404);
    }
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: true });
    expect((await asVisitor(key, 'GET', 'messages', chat.visitorToken)).json().ended).toBe(false);
    expect(await countsOf(accountId)).toEqual({ contacts: 0, leads: 0, tickets: 0 });
  });
});
