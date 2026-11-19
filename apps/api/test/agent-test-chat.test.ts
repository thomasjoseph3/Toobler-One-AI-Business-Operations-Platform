import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { ApiError } from '../src/kernel/errors';
import { createConversationRecordsService } from '../src/modules/core/conversations';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let appWithStrictLimits: FastifyInstance;

/** What the pretend AI company does next. A test changes it. Each tool call is one round; plain words end the answer. */
let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);

beforeAll(async () => {
  database = openTestDatabase();
  // Platform keys that exist only for this file (key pools are shared across the process)
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`test-chat-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
  appWithStrictLimits = await buildTestApp(database, [], {
    config,
    llmProvider: pretendAiCompany,
    strictRouteLimits: true,
  });
});
afterAll(async () => {
  await app.close();
  await appWithStrictLimits.close();
  await database.close();
});

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'POST' | 'PUT',
  url: string,
  payload?: unknown,
  options: { withCsrfHeaders?: boolean; on?: FastifyInstance } = {},
) =>
  (options.on ?? app).inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      ...(options.withCsrfHeaders === false ? {} : unsafeRequestHeaders),
      ...(person ? { cookie: person.cookieHeader } : {}),
    },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** One pretend-customer message, as the person. */
const testChat = (person: SignedInPerson | null, body: unknown, options: { on?: FastifyInstance } = {}) =>
  send(person, 'POST', '/agent/test-chat', body, options);

/** A new business that may use the platform's AI keys, is open all day, and sells one thing. */
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
  await send(person, 'POST', '/offerings', {
    name: 'Deluxe room',
    fromPricePaise: 400000,
    priceUnit: 'a night',
    gstMode: 'plus',
  });
  return person;
}

async function setRole(person: SignedInPerson, role: 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** What the business has saved, counted straight from the database. */
async function countsFor(accountId: string) {
  const count = async (table: 'conversations' | 'conversation_messages' | 'leads' | 'tickets' | 'contacts') => {
    const row = await database.system
      .selectFrom(table)
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  };
  return {
    conversations: await count('conversations'),
    messages: await count('conversation_messages'),
    leads: await count('leads'),
    tickets: await count('tickets'),
    contacts: await count('contacts'),
  };
}

/** A pretend AI that does one step per round: asks for tools, and in the last step says its words. */
const rounds =
  (...steps: Array<string | { toolCalls: { name: string; input: unknown }[] }>): LlmScript =>
  (_tried, _request, messagesSoFar = []) => {
    const roundNumber = messagesSoFar.filter((message) => message.kind === 'tool_request').length;
    return { answer: steps[Math.min(roundNumber, steps.length - 1)] };
  };

/** A pretend AI that asks for the given tools in its first round and then says the given words. */
const asksThenSays =
  (toolCalls: { name: string; input: unknown }[], words: string): LlmScript =>
  (_tried, _request, messagesSoFar = []) =>
    messagesSoFar.some((message) => message.kind === 'tool_answer') ? { answer: words } : { answer: { toolCalls } };

describe('POST /api/v1/agent/test-chat', () => {
  it('answers a pretend customer, saves the chat as a test, and says where the answer came from', async () => {
    const person = await newBusiness();
    script = asksThenSays([{ name: 'list_offerings', input: {} }], 'A deluxe room is from ₹4,000 a night plus GST.');
    const response = await testChat(person, { message: 'How much is a deluxe room?' });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      reply: 'A deluxe room is from ₹4,000 a night plus GST.',
      answeredFrom: [{ kind: 'offerings', label: 'Offerings and offers' }],
      toolsCalled: [{ name: 'list_offerings', ok: true }],
      detailsSaved: {},
      promise: null,
      heldBackAmounts: [],
    });

    const conversation = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('id', '=', body.conversationId)
      .executeTakeFirstOrThrow();
    expect(conversation).toMatchObject({
      account_id: person.profile.business.id,
      is_test: true,
      channel: 'webchat',
      status: 'open',
      created_by: { kind: 'user', id: person.profile.user.id },
    });
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select(['sender', 'body'])
      .where('conversation_id', '=', body.conversationId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    expect(messages).toEqual([
      { sender: 'customer', body: 'How much is a deluxe room?' },
      { sender: 'agent', body: 'A deluxe room is from ₹4,000 a night plus GST.' },
    ]);
  });

  it('never makes a contact, a lead or a ticket', async () => {
    const person = await newBusiness();
    const before = await countsFor(person.profile.business.id);
    script = asksThenSays(
      [{ name: 'save_details', input: { name: 'Ravi', phone: '9847012345', readyToBook: true } }],
      'Thank you, Ravi. We will send you the confirmation.',
    );
    const response = await testChat(person, { message: 'I am Ravi, 9847012345, I want to book' });
    expect(response.statusCode, response.body).toBe(200);
    const after = await countsFor(person.profile.business.id);
    expect(after.leads).toBe(before.leads);
    expect(after.tickets).toBe(before.tickets);
    expect(after.contacts).toBe(before.contacts);
    expect(after.conversations).toBe(before.conversations + 1);
  });

  it('remembers what the customer said and makes the one promise, saved as facts', async () => {
    const person = await newBusiness();
    script = asksThenSays(
      [{ name: 'save_details', input: { name: 'Ravi', phone: '98470 12345', interestedIn: 'a deluxe room' } }],
      'Thank you, Ravi. Our team will call you within 15 minutes.',
    );
    const first = await testChat(person, { message: 'I am Ravi, 98470 12345, I want a deluxe room' });
    const firstBody = first.json();
    expect(firstBody.detailsSaved).toEqual({ Name: 'Ravi', Phone: '98470 12345', 'Interested in': 'a deluxe room' });
    expect(firstBody.promise).toMatchObject({
      kind: 'call_back_open',
      sentence: 'Our team will call you within 15 minutes.',
    });
    const dueAt = new Date(firstBody.promise.dueAt).getTime();
    expect(dueAt).toBeGreaterThan(Date.now());
    expect(dueAt).toBeLessThanOrEqual(Date.now() + 16 * 60_000);

    const stored = await database.system
      .selectFrom('conversation_facts')
      .selectAll()
      .where('conversation_id', '=', firstBody.conversationId)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      account_id: person.profile.business.id,
      situation: 'sale_enquiry',
      promise_kind: 'call_back_open',
      promise_sentence: 'Our team will call you within 15 minutes.',
    });
    expect(stored.promise_made_at).not.toBeNull();

    // A second message carries on the same chat: it remembers, makes no second promise, and keeps the first promise's time
    script = asksThenSays([{ name: 'save_details', input: { dates: '5 to 7 December' } }], 'Noted the dates.');
    const second = await testChat(person, {
      conversationId: firstBody.conversationId,
      message: 'From 5 to 7 December',
    });
    const secondBody = second.json();
    expect(secondBody.conversationId).toBe(firstBody.conversationId);
    expect(secondBody.detailsSaved).toMatchObject({ Name: 'Ravi', Dates: '5 to 7 December' });
    expect(secondBody.promise).toEqual(firstBody.promise);
    const storedAgain = await database.system
      .selectFrom('conversation_facts')
      .select(['promise_made_at', 'promise_sentence'])
      .where('conversation_id', '=', firstBody.conversationId)
      .executeTakeFirstOrThrow();
    expect(storedAgain.promise_made_at?.getTime()).toBe(stored.promise_made_at?.getTime());
  });

  it('shows the AI the earlier messages of the chat when it carries on', async () => {
    const person = await newBusiness();
    script = () => ({ answer: 'Hello! How can I help?' });
    const first = (await testChat(person, { message: 'Hi' })).json();
    script = () => ({ answer: 'Sure.' });
    await testChat(person, { conversationId: first.conversationId, message: 'What do you sell?' });
    const lastRequest = pretendAiCompany.requests.at(-1);
    expect(lastRequest?.prompt.messages).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello! How can I help?' },
      { role: 'user', text: 'What do you sell?' },
    ]);
  });

  it('writes a question it cannot answer on the real Unanswered list', async () => {
    const person = await newBusiness();
    script = rounds(
      { toolCalls: [{ name: 'search_knowledge', input: { question: 'Is there EV charging?' } }] },
      { toolCalls: [{ name: 'log_unanswered_question', input: { question: 'Is there EV charging?' } }] },
      'The team will get back to you.',
    );
    const response = await testChat(person, { message: 'Is there EV charging?' });
    expect(response.statusCode, response.body).toBe(200);
    const rows = await database.system
      .selectFrom('unanswered_questions')
      .select(['question', 'count'])
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toEqual([{ question: 'Is there EV charging?', count: 1 }]);
  });

  it('saves nothing when the AI fails, so the message can be sent again', async () => {
    const person = await newBusiness();
    const before = await countsFor(person.profile.business.id);
    script = () => {
      throw new Error('401 invalid api key');
    };
    const response = await testChat(person, { message: 'Hello' });
    expect(response.statusCode).toBe(502);
    expect(await countsFor(person.profile.business.id)).toEqual(before);
  });

  it('answers 503 when the business has no AI key set up, and saves nothing', async () => {
    const person = await createSignedInPerson(app, database);
    script = () => ({ answer: 'x' });
    const response = await testChat(person, { message: 'Hello' });
    expect(response.statusCode).toBe(503);
    expect((await countsFor(person.profile.business.id)).conversations).toBe(0);
  });
});

describe('POST /api/v1/agent/test-chat: who may use it, and what it refuses', () => {
  it('answers 401 to nobody, and 403 to the own-leads-only role; staff may use it', async () => {
    const person = await newBusiness();
    script = () => ({ answer: 'Hello!' });
    expect((await testChat(null, { message: 'Hi' })).statusCode).toBe(401);
    await setRole(person, 'staff_own');
    expect((await testChat(person, { message: 'Hi' })).statusCode).toBe(403);
    await setRole(person, 'staff');
    expect((await testChat(person, { message: 'Hi' })).statusCode).toBe(200);
  });

  it('answers 404 for another business’s test chat, an unknown id, and a real customer’s conversation', async () => {
    const mine = await newBusiness();
    const theirs = await newBusiness();
    script = () => ({ answer: 'Hello!' });
    const theirChat = (await testChat(theirs, { message: 'Hi' })).json();
    expect((await testChat(mine, { conversationId: theirChat.conversationId, message: 'Hi' })).statusCode).toBe(404);
    expect((await testChat(mine, { conversationId: randomUUID(), message: 'Hi' })).statusCode).toBe(404);
    // A real conversation of my own business is not a test chat, so "Test the agent" cannot read or write it
    const realConversationId = await createConversationRecordsService({ database }).startConversation(
      mine.profile.business.id,
      {
        channel: 'webchat',
      },
    );
    const response = await testChat(mine, { conversationId: realConversationId, message: 'Hi' });
    expect(response.statusCode).toBe(404);
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select('id')
      .where('conversation_id', '=', realConversationId)
      .execute();
    expect(messages).toEqual([]);
  });

  it('answers 400 for an empty message, a too long one, an unknown field, a bad id, and a chat that is too long', async () => {
    const person = await newBusiness();
    script = () => ({ answer: 'Hello!' });
    expect((await testChat(person, {})).statusCode).toBe(400);
    expect((await testChat(person, { message: '   ' })).statusCode).toBe(400);
    expect((await testChat(person, { message: 'x'.repeat(2001) })).statusCode).toBe(400);
    expect((await testChat(person, { message: 'Hi', accountId: randomUUID() })).statusCode).toBe(400);
    expect((await testChat(person, { message: 'Hi', conversationId: 'not-an-id' })).statusCode).toBe(400);

    const chat = (await testChat(person, { message: 'Hi' })).json();
    await database.system
      .insertInto('conversation_messages')
      .values(
        Array.from({ length: 200 }, () => ({
          id: randomUUID(),
          account_id: person.profile.business.id,
          conversation_id: chat.conversationId as string,
          sender: 'customer' as const,
          body: 'filler',
        })),
      )
      .execute();
    const tooLong = await testChat(person, { conversationId: chat.conversationId, message: 'More' });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.message).toContain('Start a new one');
  });

  it('is refused without the web app’s headers (CSRF)', async () => {
    const person = await newBusiness();
    const response = await send(person, 'POST', '/agent/test-chat', { message: 'Hi' }, { withCsrfHeaders: false });
    expect(response.statusCode).toBe(403);
  });

  it('limits how fast one address may send test messages (each one costs a real AI call)', async () => {
    const person = await newBusiness();
    script = () => ({ answer: 'Hello!' });
    const answers = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      answers.push(await testChat(person, { message: 'Hi' }, { on: appWithStrictLimits }));
    }
    expect(answers[19]?.statusCode).toBe(200);
    expect(answers[20]?.statusCode).toBe(429);
  });

  it('never lets one business read another’s chat through the database fence', async () => {
    const mine = await newBusiness();
    const theirs = await newBusiness();
    script = () => ({ answer: 'Hello!' });
    const theirChat = (await testChat(theirs, { message: 'Secret question' })).json();
    const seenByMe = await database.runInAccountTransaction(mine.profile.business.id, (transaction) =>
      transaction.selectFrom('conversation_facts').select('conversation_id').execute(),
    );
    expect(seenByMe.map((row) => row.conversation_id)).not.toContain(theirChat.conversationId);
    // The ApiError import keeps the test honest about the shape of the failure the route turns into 502
    expect(new ApiError(502, 'AI_FAILED', 'x').status).toBe(502);
  });
});
