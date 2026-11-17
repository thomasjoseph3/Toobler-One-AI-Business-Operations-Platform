import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { uuidv7 } from '../src/kernel/ids';
import { signVisitorToken } from '../src/modules/channels/webchat/helpers/visitor-token';
import { MOST_MESSAGES_IN_A_WEB_CHAT } from '../src/modules/channels/webchat/services/widget-chat.service';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, captureLogs, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson, makeBusinessLive } from './support/auth';
import { openTestDatabase } from './support/harness';

const SITE = 'https://nairstays.example';

let database: Database;
let app: FastifyInstance;
let appWithStrictLimits: FastifyInstance;
let config: ReturnType<typeof testConfig>;

/** What the pretend AI company does next. A test changes it. */
let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);

beforeAll(async () => {
  database = openTestDatabase();
  // Platform keys that exist only for this file (key pools are shared across the process)
  config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`webchat-widget-${randomUUID()}`], openai: [], anthropic: [] } },
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

/** A staff request as the web app sends it. */
const asStaff = (person: SignedInPerson, method: 'GET' | 'PATCH' | 'PUT' | 'POST', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** What a visitor's browser sends: the website's Origin, never our CSRF header, and (once a chat has begun) the visitor token. */
const asVisitor = (
  key: string,
  method: 'GET' | 'POST' | 'OPTIONS',
  path: 'config' | 'messages',
  options: { origin?: string | null; token?: string; payload?: unknown; on?: FastifyInstance } = {},
) =>
  (options.on ?? app).inject({
    method,
    url: `/api/v1/public/widget/${key}/${path}`,
    headers: {
      ...(options.origin === null ? {} : { origin: options.origin ?? SITE }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload as object }),
  });

/** A new business that may use the platform's AI keys, with the chat set up for the test website. Gives the person and the widget key. */
async function newBusinessWithChat(allowedWebsites: string[] = [SITE]) {
  const person = await createSignedInPerson(app, database);
  await makeBusinessLive(database, person.profile.business.id); // a business that has not gone live does not answer visitors
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
  const settings = await asStaff(person, 'PATCH', '/channels/webchat', { allowedWebsites });
  expect(settings.statusCode, settings.body).toBe(200);
  return { person, accountId: person.profile.business.id, key: settings.json().widgetKey as string };
}

/** A pretend AI that asks for the given tools in its first round and then says the given words. */
const asksThenSays =
  (toolCalls: { name: string; input: unknown }[], words: string): LlmScript =>
  (_tried, _request, messagesSoFar = []) =>
    messagesSoFar.some((message) => message.kind === 'tool_answer') ? { answer: words } : { answer: { toolCalls } };

/** The conversations of a business, straight from the database. */
const conversationsOf = (accountId: string) =>
  database.system.selectFrom('conversations').selectAll().where('account_id', '=', accountId).execute();

describe('GET /api/v1/public/widget/{key}/config', () => {
  it('gives the look and the buttons to an allowed website, with permission for that website to read it, and no sign-in', async () => {
    const { person, key } = await newBusinessWithChat();
    await asStaff(person, 'PATCH', '/channels/webchat', {
      colour: '#1F6FEB',
      greeting: 'Welcome to Nair Stays',
      position: 'bottom_left',
      phoneNumber: '+919847012345',
      whatsappNumber: '+919847099999',
      whatsappMessage: 'Hello',
    });
    const response = await asVisitor(key, 'GET', 'config');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      colour: '#1F6FEB',
      greeting: 'Welcome to Nair Stays',
      position: 'bottom_left',
      buttons: [
        { kind: 'chat', link: null },
        { kind: 'call', link: 'tel:+919847012345' },
        { kind: 'whatsapp', link: 'https://wa.me/919847099999?text=Hello' },
      ],
    });
    expect(response.headers['access-control-allow-origin']).toBe(SITE);
    expect(response.headers['vary']).toContain('Origin');
  });

  it('tells the business "last seen on <website>"', async () => {
    const { person, key } = await newBusinessWithChat();
    expect((await asStaff(person, 'GET', '/channels/webchat')).json().lastSeen).toBeNull();
    await asVisitor(key, 'GET', 'config');
    const seen = (await asStaff(person, 'GET', '/channels/webchat')).json().lastSeen;
    expect(seen.website).toBe(SITE);
    expect(Date.now() - new Date(seen.at).getTime()).toBeLessThan(60_000);
  });

  it('answers 404 to an unknown key, 400 to a key that is not shaped like one', async () => {
    expect((await asVisitor(`wk_${'a'.repeat(32)}`, 'GET', 'config')).statusCode).toBe(404);
    expect((await asVisitor('hello', 'GET', 'config')).statusCode).toBe(400);
  });

  it('refuses every website that is not on the list: another site, another port, another scheme, no website at all', async () => {
    const { key } = await newBusinessWithChat();
    for (const origin of [
      'https://evil.example',
      'https://nairstays.example:8443',
      'http://nairstays.example',
      'null',
    ]) {
      const response = await asVisitor(key, 'GET', 'config', { origin });
      expect(response.statusCode, origin).toBe(403);
      expect(response.json().error.code).toBe('WEBSITE_NOT_ALLOWED');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect((await asVisitor(key, 'GET', 'config', { origin: null })).statusCode).toBe(403);
  });

  it('works nowhere while the business has listed no website (safe by default)', async () => {
    const { key } = await newBusinessWithChat([]);
    expect((await asVisitor(key, 'GET', 'config')).statusCode).toBe(403);
  });

  it('answers 404, the same as an unknown key, while the business has the chat switched off, and works again after', async () => {
    const { person, key } = await newBusinessWithChat();
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    const off = await asVisitor(key, 'GET', 'config');
    const unknown = await asVisitor(`wk_${'b'.repeat(32)}`, 'GET', 'config');
    expect(off.statusCode).toBe(404);
    expect(off.json()).toEqual(unknown.json());
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: true });
    expect((await asVisitor(key, 'GET', 'config')).statusCode).toBe(200);
  });

  it('shows each business only its own look: a key never reaches another business', async () => {
    const first = await newBusinessWithChat();
    const second = await newBusinessWithChat();
    await asStaff(first.person, 'PATCH', '/channels/webchat', { greeting: 'First business' });
    await asStaff(second.person, 'PATCH', '/channels/webchat', { greeting: 'Second business' });
    expect((await asVisitor(first.key, 'GET', 'config')).json().greeting).toBe('First business');
    expect((await asVisitor(second.key, 'GET', 'config')).json().greeting).toBe('Second business');
  });
});

describe('OPTIONS /api/v1/public/widget/{key}/… (the browser asks permission first)', () => {
  it('gives permission to an allowed website for the methods and headers the chat uses', async () => {
    const { key } = await newBusinessWithChat();
    for (const path of ['config', 'messages'] as const) {
      const response = await asVisitor(key, 'OPTIONS', path);
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(SITE);
      expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
      expect(response.headers['access-control-allow-headers']).toBe('content-type, authorization');
    }
  });

  it('gives no permission to another website, an unknown key, or a switched-off chat (and reveals nothing)', async () => {
    const { person, key } = await newBusinessWithChat();
    const refused = await asVisitor(key, 'OPTIONS', 'messages', { origin: 'https://evil.example' });
    expect(refused.statusCode).toBe(204);
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
    const unknown = await asVisitor(`wk_${'c'.repeat(32)}`, 'OPTIONS', 'config');
    expect(unknown.headers['access-control-allow-origin']).toBeUndefined();
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    expect((await asVisitor(key, 'OPTIONS', 'config')).headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('POST /api/v1/public/widget/{key}/messages', () => {
  it('does not answer a business that has not gone live: 503 NOT_OPEN_YET, nothing saved, the agent never asked; it answers once the business is live', async () => {
    const { accountId, key } = await newBusinessWithChat();
    await database.system
      .updateTable('accounts')
      .set({ live_at: null, live_by: null })
      .where('id', '=', accountId)
      .execute();
    let timesTheAgentWasAsked = 0;
    script = () => {
      timesTheAgentWasAsked += 1;
      return { answer: 'Hello!' };
    };
    const refused = await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi there' } });
    expect(refused.statusCode, refused.body).toBe(503);
    expect(refused.json().error.code).toBe('NOT_OPEN_YET');
    expect(await conversationsOf(accountId)).toHaveLength(0);
    expect(timesTheAgentWasAsked).toBe(0);

    await makeBusinessLive(database, accountId);
    const answered = await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi there' } });
    expect(answered.statusCode, answered.body).toBe(200);
    expect(timesTheAgentWasAsked).toBe(1);
  });

  it('starts a real chat: the agent answers, the chat and both messages are saved as a web chat of this business, not a test', async () => {
    const { accountId, key } = await newBusinessWithChat();
    script = () => ({ answer: 'Hello! How can I help?' });
    const response = await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi there' } });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ reply: 'Hello! How can I help?', newChat: true });
    expect(typeof body.visitorToken).toBe('string');
    expect(response.headers['access-control-allow-origin']).toBe(SITE);

    const conversations = await conversationsOf(accountId);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      channel: 'webchat',
      is_test: false,
      status: 'open',
      ended_at: null,
      from_phone_key: null,
      from_email: null,
      created_by: { kind: 'system', id: 'channel.webchat' },
    });
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select(['sender', 'body'])
      .where('conversation_id', '=', conversations[0]?.id as string)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    expect(messages).toEqual([
      { sender: 'customer', body: 'Hi there' },
      { sender: 'agent', body: 'Hello! How can I help?' },
    ]);
  });

  it('carries on the same chat with the token, and the agent sees what was said before', async () => {
    const { accountId, key } = await newBusinessWithChat();
    let seenByTheAgent: string[] = [];
    script = (_tried, request) => {
      seenByTheAgent = request.prompt.messages.map((message) => message.text);
      return { answer: 'Sure.' };
    };
    const first = (await asVisitor(key, 'POST', 'messages', { payload: { message: 'First question' } })).json();
    const second = await asVisitor(key, 'POST', 'messages', {
      token: first.visitorToken,
      payload: { message: 'Second question' },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().newChat).toBe(false);
    expect(seenByTheAgent.join(' | ')).toContain('First question');
    expect(seenByTheAgent.join(' | ')).toContain('Second question');

    const conversations = await conversationsOf(accountId);
    expect(conversations).toHaveLength(1);
    const messageCount = await database.system
      .selectFrom('conversation_messages')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('conversation_id', '=', conversations[0]?.id as string)
      .executeTakeFirstOrThrow();
    expect(Number(messageCount.total)).toBe(4);
  });

  it('starts a new chat when no token is sent', async () => {
    const { accountId, key } = await newBusinessWithChat();
    await asVisitor(key, 'POST', 'messages', { payload: { message: 'One' } });
    const second = await asVisitor(key, 'POST', 'messages', { payload: { message: 'Two' } });
    expect(second.json().newChat).toBe(true);
    expect(await conversationsOf(accountId)).toHaveLength(2);
  });

  it('starts a new chat when the earlier one has ended', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const first = (await asVisitor(key, 'POST', 'messages', { payload: { message: 'One' } })).json();
    await database.system
      .updateTable('conversations')
      .set({ ended_at: new Date() })
      .where('account_id', '=', accountId)
      .execute();
    const second = await asVisitor(key, 'POST', 'messages', {
      token: first.visitorToken,
      payload: { message: 'Again' },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().newChat).toBe(true);
    expect(await conversationsOf(accountId)).toHaveLength(2);
  });

  it('links the visitor to the conversation when they give a phone number and an email, once, and never replaces them', async () => {
    const { accountId, key } = await newBusinessWithChat();
    script = asksThenSays(
      [{ name: 'save_details', input: { name: 'Ravi', phone: '98470 12345', email: 'Ravi@Example.com' } }],
      'Thank you, Ravi.',
    );
    const first = (await asVisitor(key, 'POST', 'messages', { payload: { message: 'I am Ravi, 98470 12345' } })).json();
    const [conversation] = await conversationsOf(accountId);
    // The business's country is India (the default), so the number is read as an Indian number
    expect(conversation).toMatchObject({ from_phone_key: '919847012345', from_email: 'ravi@example.com' });

    script = asksThenSays(
      [{ name: 'save_details', input: { phone: '99999 88888', email: 'other@example.com' } }],
      'Noted.',
    );
    await asVisitor(key, 'POST', 'messages', {
      token: first.visitorToken,
      payload: { message: 'Use this number instead' },
    });
    const [afterwards] = await conversationsOf(accountId);
    expect(afterwards).toMatchObject({ from_phone_key: '919847012345', from_email: 'ravi@example.com' });
  });

  it('keeps the chat anonymous when the visitor gives no phone or email', async () => {
    const { accountId, key } = await newBusinessWithChat();
    script = () => ({ answer: 'Happy to help.' });
    await asVisitor(key, 'POST', 'messages', { payload: { message: 'Just looking' } });
    expect(await conversationsOf(accountId)).toMatchObject([{ from_phone_key: null, from_email: null }]);
  });

  it('never makes a lead, a ticket or a contact by itself (the sorting does that when the chat ends)', async () => {
    const { accountId, key } = await newBusinessWithChat();
    script = asksThenSays([{ name: 'save_details', input: { name: 'Ravi', phone: '98470 12345' } }], 'Thanks.');
    await asVisitor(key, 'POST', 'messages', { payload: { message: 'I am Ravi, 98470 12345' } });
    for (const table of ['leads', 'tickets', 'contacts'] as const) {
      const rows = await database.system.selectFrom(table).select('id').where('account_id', '=', accountId).execute();
      expect(rows, table).toEqual([]);
    }
  });

  it('does not need our CSRF header (the website check and the token take its place)', async () => {
    const { key } = await newBusinessWithChat();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/public/widget/${key}/messages`,
      headers: { origin: SITE },
      payload: { message: 'Hi' },
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('refuses a website that is not on the list, with nothing saved', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const response = await asVisitor(key, 'POST', 'messages', {
      origin: 'https://evil.example',
      payload: { message: 'Hi' },
    });
    expect(response.statusCode).toBe(403);
    expect(await conversationsOf(accountId)).toEqual([]);
  });

  it('answers 404 to an unknown key and while the chat is switched off', async () => {
    const { person, key } = await newBusinessWithChat();
    expect(
      (await asVisitor(`wk_${'d'.repeat(32)}`, 'POST', 'messages', { payload: { message: 'Hi' } })).statusCode,
    ).toBe(404);
    await asStaff(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    expect((await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi' } })).statusCode).toBe(404);
  });

  it('refuses bad messages: empty, only spaces, too long, not text, missing', async () => {
    const { key } = await newBusinessWithChat();
    for (const payload of [{ message: '' }, { message: '   ' }, { message: 'x'.repeat(1001) }, { message: 42 }, {}]) {
      const response = await asVisitor(key, 'POST', 'messages', { payload });
      expect(response.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
    }
    expect((await asVisitor(key, 'POST', 'messages', { payload: { message: 'x'.repeat(1000) } })).statusCode).toBe(200);
  });

  it('refuses a token that is not ours, was changed, or is not a token (401, so the browser starts a new chat)', async () => {
    const { key } = await newBusinessWithChat();
    const first = (await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi' } })).json();
    const changed = `${first.visitorToken.slice(0, -3)}abc`;
    for (const token of ['not-a-token', changed]) {
      const response = await asVisitor(key, 'POST', 'messages', { token, payload: { message: 'Hi again' } });
      expect(response.statusCode, token).toBe(401);
      expect(response.json().error.code).toBe('VISITOR_TOKEN_INVALID');
    }
  });

  it('refuses a token made for another business, even with that business’s own key', async () => {
    const first = await newBusinessWithChat();
    const second = await newBusinessWithChat();
    const tokenOfFirst = (await asVisitor(first.key, 'POST', 'messages', { payload: { message: 'Hi' } })).json()
      .visitorToken;
    const response = await asVisitor(second.key, 'POST', 'messages', {
      token: tokenOfFirst,
      payload: { message: 'Let me in' },
    });
    expect(response.statusCode).toBe(401);
    // Nothing was added to the first business's chat, and nothing was started in the second
    expect(await conversationsOf(second.accountId)).toEqual([]);
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select('id')
      .where('account_id', '=', first.accountId)
      .execute();
    expect(messages).toHaveLength(2);
  });

  it('refuses a token that names a test chat, an unknown chat, or a chat of another channel', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const testChatId = uuidv7();
    const emailChatId = uuidv7();
    await database.system
      .insertInto('conversations')
      .values([
        { id: testChatId, account_id: accountId, channel: 'webchat', is_test: true },
        { id: emailChatId, account_id: accountId, channel: 'email' },
      ])
      .execute();
    for (const conversationId of [testChatId, emailChatId, uuidv7()]) {
      const token = await signVisitorToken({ appSecret: config.auth.jwtSecret, accountId, conversationId });
      const response = await asVisitor(key, 'POST', 'messages', { token, payload: { message: 'Hi' } });
      expect(response.statusCode, conversationId).toBe(401);
    }
  });

  it('refuses a chat that has become too long', async () => {
    const { accountId, key } = await newBusinessWithChat();
    const first = (await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hi' } })).json();
    const [conversation] = await conversationsOf(accountId);
    await database.system
      .insertInto('conversation_messages')
      .values(
        Array.from({ length: MOST_MESSAGES_IN_A_WEB_CHAT }, (_unused, position) => ({
          id: uuidv7(),
          account_id: accountId,
          conversation_id: conversation?.id as string,
          sender: 'customer' as const,
          body: `filler ${position}`,
        })),
      )
      .execute();
    const response = await asVisitor(key, 'POST', 'messages', {
      token: first.visitorToken,
      payload: { message: 'More' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CHAT_TOO_LONG');
  });

  it('tells the visitor plainly when the AI cannot answer, and saves nothing so the message can be sent again', async () => {
    const { accountId, key } = await newBusinessWithChat();
    script = () => {
      throw new Error('401 invalid api key');
    };
    const response = await asVisitor(key, 'POST', 'messages', { payload: { message: 'Hello' } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' });
    expect(response.json().error.message).not.toContain('api key');
    expect(response.headers['access-control-allow-origin']).toBe(SITE);
    expect(await conversationsOf(accountId)).toEqual([]);
  });

  it('does not write the visitor’s words or the token to the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany, logger });
    try {
      const { key } = await newBusinessWithChat();
      script = () => ({ answer: 'The reply words.' });
      const response = await asVisitor(key, 'POST', 'messages', {
        on: loggingApp,
        payload: { message: 'my secret words 98470 12345' },
      });
      expect(response.statusCode).toBe(200);
      expect(text()).not.toContain('my secret words');
      expect(text()).not.toContain('The reply words');
      expect(text()).not.toContain(response.json().visitorToken);
    } finally {
      await loggingApp.close();
    }
  });
});

describe('the limits on the public chat routes', () => {
  it('limits new chats from one address, but not messages in a chat that has begun', async () => {
    const { key } = await newBusinessWithChat();
    const first = (
      await asVisitor(key, 'POST', 'messages', { on: appWithStrictLimits, payload: { message: 'Hi' } })
    ).json();
    // 9 more new chats make 10: the limit; the 11th is refused
    for (let chat = 0; chat < 9; chat += 1) {
      const response = await asVisitor(key, 'POST', 'messages', {
        on: appWithStrictLimits,
        payload: { message: 'Hi' },
      });
      expect(response.statusCode, `chat ${chat + 2}`).toBe(200);
    }
    const refused = await asVisitor(key, 'POST', 'messages', { on: appWithStrictLimits, payload: { message: 'Hi' } });
    expect(refused.statusCode).toBe(429);
    // A visitor already chatting can still send (the route's own limit is 20 a minute)
    const carryingOn = await asVisitor(key, 'POST', 'messages', {
      on: appWithStrictLimits,
      token: first.visitorToken,
      payload: { message: 'Still here' },
    });
    expect(carryingOn.statusCode, carryingOn.body).toBe(200);
  });

  it('limits how often one address may send messages in a minute', async () => {
    const { key } = await newBusinessWithChat();
    const token = (
      await asVisitor(key, 'POST', 'messages', { on: appWithStrictLimits, payload: { message: 'Hi' } })
    ).json().visitorToken;
    let lastStatus = 0;
    // The route allows 20 a minute and one was used above; the limit stops the rest
    for (let message = 0; message < 21 && lastStatus !== 429; message += 1) {
      lastStatus = (
        await asVisitor(key, 'POST', 'messages', { on: appWithStrictLimits, token, payload: { message: 'More' } })
      ).statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
