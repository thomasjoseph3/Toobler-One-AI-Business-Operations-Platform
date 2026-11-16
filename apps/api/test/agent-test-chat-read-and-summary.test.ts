import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import type { JobRun } from '../src/kernel/jobs/jobs';
import agentsModule from '../src/modules/core/agents/module';
import { createConversationFinaliser, createConversationRecordsService } from '../src/modules/core/conversations';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// Reading a test chat back, its summary, the summary job, and the rule that a test chat is never sorted into a lead or a ticket.

let database: Database;
let app: FastifyInstance;

/** What the pretend AI company does next. A test changes it. */
let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`read-summary-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const send = (person: SignedInPerson | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A new business that may use the platform's AI keys and is open all day. */
async function newBusiness(): Promise<SignedInPerson> {
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
  await send(person, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
  return person;
}

async function setRole(person: SignedInPerson, role: 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** The AI's answers by job: a chat turn says the words given; a summary says the text given. */
function aiSays(options: {
  reply?: string;
  summary?: string;
  toolCalls?: { name: string; input: unknown }[];
}): LlmScript {
  return (_tried, request, messagesSoFar = []) => {
    if (request.tag.task === 'summarise') return { answer: options.summary ?? 'The customer asked about a room.' };
    const toolWasAnswered = messagesSoFar.some((message) => message.kind === 'tool_answer');
    if (options.toolCalls && !toolWasAnswered) return { answer: { toolCalls: options.toolCalls } };
    return { answer: options.reply ?? 'Hello!' };
  };
}

/** A test chat with a first and a second message, as the person. Answers the chat's id. */
async function startChat(person: SignedInPerson): Promise<string> {
  script = aiSays({
    toolCalls: [{ name: 'save_details', input: { name: 'Ravi', phone: '98470 12345', interestedIn: 'a deluxe room' } }],
    reply: 'Thank you, Ravi. Our team will call you within 15 minutes.',
  });
  const first = await send(person, 'POST', '/agent/test-chat', {
    message: 'I am Ravi, 98470 12345, I want a deluxe room',
  });
  expect(first.statusCode, first.body).toBe(200);
  return first.json().conversationId as string;
}

describe('GET /api/v1/agent/test-chats/{conversationId}', () => {
  it('reads a saved test chat back: messages in order, what the agent learned, the promise, and no summary yet', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ reply: 'Noted the dates.' });
    await send(person, 'POST', '/agent/test-chat', { conversationId, message: 'From 5 to 7 December' });

    const response = await send(person, 'GET', `/agent/test-chats/${conversationId}`);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.conversationId).toBe(conversationId);
    expect(body.messages.map((message: { sender: string; body: string }) => [message.sender, message.body])).toEqual([
      ['customer', 'I am Ravi, 98470 12345, I want a deluxe room'],
      ['agent', 'Thank you, Ravi. Our team will call you within 15 minutes.'],
      ['customer', 'From 5 to 7 December'],
      ['agent', 'Noted the dates.'],
    ]);
    expect(body.detailsSaved).toEqual({ Name: 'Ravi', Phone: '98470 12345', 'Interested in': 'a deluxe room' });
    expect(body.situation).toBe('sale_enquiry');
    expect(body.promise).toMatchObject({
      kind: 'call_back_open',
      sentence: 'Our team will call you within 15 minutes.',
    });
    expect(body.summary).toBeNull();
    expect(body.summarisedAt).toBeNull();
  });

  it('answers 401 to nobody and 403 to the own-leads-only role, and 400 for an id that is not an id', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    expect((await send(null, 'GET', `/agent/test-chats/${conversationId}`)).statusCode).toBe(401);
    expect((await send(person, 'GET', '/agent/test-chats/not-an-id')).statusCode).toBe(400);
    await setRole(person, 'staff_own');
    expect((await send(person, 'GET', `/agent/test-chats/${conversationId}`)).statusCode).toBe(403);
    await setRole(person, 'staff');
    expect((await send(person, 'GET', `/agent/test-chats/${conversationId}`)).statusCode).toBe(200);
  });

  it('answers 404 for another business’s chat, an unknown id, and a real customer’s conversation', async () => {
    const mine = await newBusiness();
    const theirs = await newBusiness();
    const theirChat = await startChat(theirs);
    expect((await send(mine, 'GET', `/agent/test-chats/${theirChat}`)).statusCode).toBe(404);
    expect((await send(mine, 'GET', `/agent/test-chats/${randomUUID()}`)).statusCode).toBe(404);
    const realConversationId = await createConversationRecordsService({ database }).startConversation(
      mine.profile.business.id,
      { channel: 'webchat' },
    );
    expect((await send(mine, 'GET', `/agent/test-chats/${realConversationId}`)).statusCode).toBe(404);
  });
});

describe('POST /api/v1/agent/test-chats/{conversationId}/summary', () => {
  it('writes the summary, saves it, and shows it when the chat is read back', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ summary: 'Summary: Ravi asked about a deluxe room and was promised a call within 15 minutes.' });
    const response = await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      conversationId,
      summary: 'Ravi asked about a deluxe room and was promised a call within 15 minutes.',
      writtenByAi: true,
    });
    const readBack = (await send(person, 'GET', `/agent/test-chats/${conversationId}`)).json();
    expect(readBack.summary).toBe('Ravi asked about a deluxe room and was promised a call within 15 minutes.');
    expect(readBack.summarisedAt).not.toBeNull();
  });

  it('asks the AI for a summary with the conversation as data, and without the phone number', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ summary: 'A short summary.' });
    await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    const request = pretendAiCompany.requests.at(-1);
    expect(request?.tag).toMatchObject({ task: 'summarise', agentId: 'summariser', conversationId });
    expect(request?.prompt.messages[0]?.text).toContain('Customer: I am Ravi');
    // The facts shown to the AI leave out the phone number
    expect(request?.prompt.changingSystemText).toContain('Name: Ravi');
    expect(request?.prompt.changingSystemText).not.toContain('98470');
  });

  it('writes the summary again when asked again (the later one replaces the earlier)', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ summary: 'First summary.' });
    await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    script = aiSays({ summary: 'Second summary.' });
    await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    expect((await send(person, 'GET', `/agent/test-chats/${conversationId}`)).json().summary).toBe('Second summary.');
  });

  it('uses the plain summary written by code when the AI’s own holds an amount nobody gave', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ summary: 'Ravi wants a deluxe room for 3 nights, a total of ₹12,000.' });
    const response = await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    const body = response.json();
    expect(body.writtenByAi).toBe(false);
    expect(body.summary).not.toContain('12,000');
    expect(body.summary).toContain('name: Ravi');
    expect(body.summary).toContain('"Our team will call you within 15 minutes."');
  });

  it('keeps the earlier summary and answers 502 when the AI fails', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    script = aiSays({ summary: 'A good summary.' });
    await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`);
    script = () => {
      throw new Error('401 invalid api key');
    };
    expect((await send(person, 'POST', `/agent/test-chats/${conversationId}/summary`)).statusCode).toBe(502);
    expect((await send(person, 'GET', `/agent/test-chats/${conversationId}`)).json().summary).toBe('A good summary.');
  });

  it('answers 401, 403, 400 and 404 where it should', async () => {
    const mine = await newBusiness();
    const theirs = await newBusiness();
    const myChat = await startChat(mine);
    const theirChat = await startChat(theirs);
    script = aiSays({ summary: 'x' });
    expect((await send(null, 'POST', `/agent/test-chats/${myChat}/summary`)).statusCode).toBe(401);
    expect((await send(mine, 'POST', '/agent/test-chats/not-an-id/summary')).statusCode).toBe(400);
    expect((await send(mine, 'POST', `/agent/test-chats/${theirChat}/summary`)).statusCode).toBe(404);
    expect((await send(mine, 'POST', `/agent/test-chats/${randomUUID()}/summary`)).statusCode).toBe(404);
    const realConversationId = await createConversationRecordsService({ database }).startConversation(
      mine.profile.business.id,
      { channel: 'webchat' },
    );
    expect((await send(mine, 'POST', `/agent/test-chats/${realConversationId}/summary`)).statusCode).toBe(404);
    await setRole(mine, 'staff_own');
    expect((await send(mine, 'POST', `/agent/test-chats/${myChat}/summary`)).statusCode).toBe(403);
  });
});

describe('the summary job (a channel queues it when a conversation ends)', () => {
  /** Runs the module's job the way the job runner would. */
  async function runSummariseJob(accountId: string | undefined, data: Record<string, unknown>) {
    const definition = agentsModule.jobs?.find((job) => job.name === 'agents.summarise_conversation');
    if (!definition) throw new Error('the job is missing');
    await definition.run({
      data: { ...(accountId ? { accountId } : {}), ...data },
      accountContext: accountId ? app.kernel.contextFor(accountId, { kind: 'system', id: definition.name }) : undefined,
      enqueueJob: async () => {},
      listAccountIds: async () => [],
      logger: console as never,
      services: {
        config: app.kernel.config,
        database,
        mail: app.kernel.mail,
        llm: app.kernel.llm,
      },
    } satisfies JobRun);
  }

  /** A real (not test) conversation with the given customer and agent messages. */
  async function realConversation(accountId: string, lines: Array<['customer' | 'agent', string]>) {
    const records = createConversationRecordsService({ database });
    const conversationId = await records.startConversation(accountId, { channel: 'whatsapp' });
    for (const [sender, body] of lines) await records.addMessage(accountId, conversationId, { sender, body });
    return conversationId;
  }

  const summaryOf = async (conversationId: string) =>
    (
      await database.system
        .selectFrom('conversation_facts')
        .select('summary')
        .where('conversation_id', '=', conversationId)
        .executeTakeFirst()
    )?.summary;

  it('summarises a real conversation that the agent never spoke in, and saves it', async () => {
    const person = await newBusiness();
    const accountId = person.profile.business.id;
    const conversationId = await realConversation(accountId, [
      ['customer', 'Hi, is there parking?'],
      ['agent', 'Yes, free parking for guests.'],
    ]);
    script = aiSays({ summary: 'The customer asked about parking and was told it is free for guests.' });
    await runSummariseJob(accountId, { conversationId });
    expect(await summaryOf(conversationId)).toBe(
      'The customer asked about parking and was told it is free for guests.',
    );
    expect(pretendAiCompany.requests.at(-1)?.tag.channel).toBe('whatsapp');
  });

  it('writes "no messages" with no AI call when the customer said nothing', async () => {
    const person = await newBusiness();
    const accountId = person.profile.business.id;
    const conversationId = await realConversation(accountId, [['agent', 'Hello! How can I help?']]);
    const callsBefore = pretendAiCompany.requests.length;
    await runSummariseJob(accountId, { conversationId });
    expect(await summaryOf(conversationId)).toBe('The customer sent no messages.');
    expect(pretendAiCompany.requests.length).toBe(callsBefore);
  });

  it('fails clearly for a conversation that is not this business’s, a missing id, or no business', async () => {
    const mine = await newBusiness();
    const theirs = await newBusiness();
    const theirConversation = await realConversation(theirs.profile.business.id, [['customer', 'Secret']]);
    await expect(
      runSummariseJob(mine.profile.business.id, { conversationId: theirConversation }),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(runSummariseJob(mine.profile.business.id, {})).rejects.toThrow('conversationId');
    await expect(runSummariseJob(undefined, { conversationId: theirConversation })).rejects.toThrow('business');
    expect(await summaryOf(theirConversation)).toBeUndefined();
  });

  it('fails (so the job is tried again) and changes nothing when the AI cannot answer', async () => {
    const person = await newBusiness();
    const accountId = person.profile.business.id;
    const conversationId = await realConversation(accountId, [['customer', 'Hello']]);
    script = () => {
      throw new Error('429 quota exceeded');
    };
    await expect(runSummariseJob(accountId, { conversationId })).rejects.toBeTruthy();
    expect(await summaryOf(conversationId)).toBeUndefined();
  });
});

describe('a test chat is never sorted into a lead or a ticket', () => {
  /** A finaliser whose AI sorter must never be asked. */
  const finaliser = () =>
    createConversationFinaliser({
      database,
      classifier: {
        classifyConversation: async () => {
          throw new Error('The AI must not be asked to sort a test chat');
        },
      } as never,
    });

  const countOf = async (table: 'leads' | 'tickets' | 'contacts' | 'conversation_outcomes', accountId: string) => {
    const row = await database.system
      .selectFrom(table)
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  };

  it('does nothing when asked to sort it: no type, no outcomes, no contact, lead or ticket, and it stays open', async () => {
    const person = await newBusiness();
    const accountId = person.profile.business.id;
    const conversationId = await startChat(person);
    const before = {
      leads: await countOf('leads', accountId),
      tickets: await countOf('tickets', accountId),
      contacts: await countOf('contacts', accountId),
      outcomes: await countOf('conversation_outcomes', accountId),
    };

    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(result).toMatchObject({ conversationId, result: 'test_chat', outcomes: [] });

    const conversation = await database.system
      .selectFrom('conversations')
      .select(['status', 'type_key', 'ended_at'])
      .where('id', '=', conversationId)
      .executeTakeFirstOrThrow();
    expect(conversation).toEqual({ status: 'open', type_key: null, ended_at: null });
    expect({
      leads: await countOf('leads', accountId),
      tickets: await countOf('tickets', accountId),
      contacts: await countOf('contacts', accountId),
      outcomes: await countOf('conversation_outcomes', accountId),
    }).toEqual(before);
  });

  it('is not read as a real conversation, and its type cannot be set by a person', async () => {
    const person = await newBusiness();
    const conversationId = await startChat(person);
    expect((await send(person, 'GET', `/conversations/${conversationId}`)).statusCode).toBe(404);
    const setType = await send(person, 'POST', `/conversations/${conversationId}/type`, { typeKey: 'complaint' });
    expect([404, 409]).toContain(setType.statusCode);
    expect(
      (
        await database.system
          .selectFrom('conversations')
          .select('type_key')
          .where('id', '=', conversationId)
          .executeTakeFirstOrThrow()
      ).type_key,
    ).toBeNull();
  });

  it('still sorts a real conversation as before (the skip is only for test chats)', async () => {
    const person = await newBusiness();
    const accountId = person.profile.business.id;
    const conversationId = await createConversationRecordsService({ database }).startConversation(accountId, {
      channel: 'webchat',
    });
    // Nothing from the customer: settled by a rule, with no AI, and sorted
    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(result.result).toBe('sorted');
    expect(result.typeKey).toBe('no_conversation');
  });
});
