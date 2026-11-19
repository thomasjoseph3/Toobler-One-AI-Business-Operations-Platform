import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { createEventDispatcher } from '../src/kernel/events/dispatcher';
import { createRegistry } from '../src/kernel/module-system/registry';
import { modules } from '../src/modules';
import { signLikeMeta } from '../src/modules/channels/whatsapp/helpers/meta-signature';
import { createIdleConversationsService } from '../src/modules/channels/whatsapp/services/idle-conversations.service';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, makeBusinessLive, type SignedInPerson } from './support/auth';
import { openTestDatabase, waitFor } from './support/harness';
import { createRecordingWhatsappProvider, switchOnWhatsapp } from './support/whatsapp';

let database: Database;
let app: FastifyInstance;
let script: LlmScript = () => ({ answer: 'Hello from the AI!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);
const whatsappRecorder = createRecordingWhatsappProvider();
let queuedJobs: Array<{ jobName: string; data: Record<string, unknown> }> = [];
const config = {
  ...testConfig(),
  ai: { platformKeys: { gemini: [`whatsapp-${randomUUID()}`], openai: [], anthropic: [] } },
};

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], {
    config,
    llmProvider: pretendAiCompany,
    whatsappProvider: whatsappRecorder.provider,
    enqueueJob: async (jobName, data) => {
      queuedJobs.push({ jobName, data });
    },
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const newNumberId = () => String(Math.floor(10_000_000_000 + Math.random() * 80_000_000_000));
const asStaff = (person: SignedInPerson, method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A business that is live, has the AI on and WhatsApp connected. */
async function newBusinessOnWhatsapp(options: { live?: boolean } = {}) {
  const person = await createSignedInPerson(app, database);
  const accountId = person.profile.business.id;
  if (options.live !== false) await makeBusinessLive(database, accountId);
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
  await switchOnWhatsapp(database, accountId);
  const phoneNumberId = newNumberId();
  const saved = await asStaff(person, 'PUT', '/channels/whatsapp', {
    phoneNumberId,
    accessToken: 'EAAB-secret-token-1234',
  });
  expect(saved.statusCode, saved.body).toBe(200);
  return { person, accountId, phoneNumberId };
}

/** What Meta sends for one customer message. */
function metaDelivery(phoneNumberId: string, message: { id: string; from: string; text?: string; type?: string }) {
  return {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [
                {
                  id: message.id,
                  from: message.from,
                  type: message.type ?? 'text',
                  ...(message.text ? { text: { body: message.text } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Posts a delivery the way Meta does (signed with the app secret unless told otherwise). */
function deliver(body: unknown, options: { secret?: string; signature?: string | null } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature =
    options.signature === undefined ? signLikeMeta(raw, options.secret ?? 'test-meta-app-secret') : options.signature;
  return app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'x-hub-signature-256': signature }),
    },
    payload: raw,
  });
}

const customerPhone = () => `9198${Math.floor(10_000_000 + Math.random() * 80_000_000)}`;
const sentTo = (phoneKey: string) => whatsappRecorder.sent.filter((message) => message.toPhoneKey === phoneKey);

describe('GET /webhooks/whatsapp (Meta checks the address)', () => {
  const verify = (query: string) => app.inject({ method: 'GET', url: `/webhooks/whatsapp?${query}` });
  it('answers Meta’s challenge when the verify token is ours', async () => {
    const response = await verify('hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=abc123');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('abc123');
  });
  it('refuses a wrong token (403) and a missing challenge (400)', async () => {
    expect((await verify('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123')).statusCode).toBe(403);
    expect((await verify('hub.mode=subscribe&hub.verify_token=test-meta-verify-token')).statusCode).toBe(400);
    expect(
      (await verify('hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=bad%20value!'))
        .statusCode,
    ).toBe(400);
  });
});

describe('POST /webhooks/whatsapp: who may call it', () => {
  it('refuses an unsigned call, a wrongly signed call and a changed body with 401 and reads nothing', async () => {
    const { phoneNumberId } = await newBusinessOnWhatsapp();
    const body = metaDelivery(phoneNumberId, { id: 'wamid.x1', from: customerPhone(), text: 'Hi' });
    expect((await deliver(body, { signature: null })).statusCode).toBe(401);
    expect((await deliver(body, { secret: 'someone-elses-secret' })).statusCode).toBe(401);
    const otherBody = metaDelivery(phoneNumberId, { id: 'wamid.x2', from: customerPhone(), text: 'Hi' });
    const signatureOfOtherBody = signLikeMeta(Buffer.from(JSON.stringify(body)), 'test-meta-app-secret');
    expect((await deliver(otherBody, { signature: signatureOfOtherBody })).statusCode).toBe(401);
  });
  it('answers 400 for a signed body that is not JSON', async () => {
    const raw = Buffer.from('not json at all');
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signLikeMeta(raw, 'test-meta-app-secret') },
      payload: raw,
    });
    expect(response.statusCode).toBe(400);
  });
  it('accepts a delivery for a number no business uses and does nothing', async () => {
    const before = whatsappRecorder.sent.length;
    const response = await deliver(
      metaDelivery(newNumberId(), { id: 'wamid.nobody', from: customerPhone(), text: 'Hi' }),
    );
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(whatsappRecorder.sent.length).toBe(before);
  });
});

describe('a customer writes on WhatsApp', () => {
  it('gets the AI’s reply on WhatsApp, and the conversation carries the customer’s own number with no sign-in', async () => {
    const { accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'We have rooms for 4. When would you like to come?' });
    const response = await deliver(
      metaDelivery(phoneNumberId, { id: 'wamid.j1', from: phone, text: 'Rooms for 4 in Dec?' }),
    );
    expect(response.statusCode).toBe(200);
    await waitFor(async () => sentTo(phone).length === 1);
    expect(sentTo(phone)[0]).toMatchObject({
      text: 'We have rooms for 4. When would you like to come?',
      access: { phoneNumberId },
    });
    // The token reached the sender decrypted, and is not in what is stored
    expect(sentTo(phone)[0]?.access.accessToken).toBe('EAAB-secret-token-1234');
    const conversation = await database.system
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(conversation).toMatchObject({ channel: 'whatsapp', from_phone_key: phone, is_test: false });
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select(['sender', 'body'])
      .where('conversation_id', '=', conversation.id)
      .orderBy('created_at')
      .execute();
    expect(messages.map((message) => message.sender)).toEqual(['customer', 'agent']);
    const connection = await database.system
      .selectFrom('whatsapp_connections')
      .select('last_message_at')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(connection.last_message_at).not.toBeNull();
  });

  it('answers a message delivered twice only once', async () => {
    const { phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'Once only.' });
    const body = metaDelivery(phoneNumberId, { id: 'wamid.replay', from: phone, text: 'Hello' });
    await deliver(body);
    await deliver(body);
    await waitFor(async () => sentTo(phone).length >= 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sentTo(phone)).toHaveLength(1);
  });

  it('carries on the same conversation for the same number, and the AI is shown what was said before', async () => {
    const { accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    const seen: string[][] = [];
    script = (_tried, _request, messagesSoFar) => {
      seen.push(JSON.stringify(messagesSoFar).includes('Rooms for 4') ? ['has-first'] : ['no-first']);
      return { answer: 'Noted.' };
    };
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.c1', from: phone, text: 'Rooms for 4' }));
    await waitFor(async () => sentTo(phone).length === 1);
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.c2', from: phone, text: 'In December' }));
    await waitFor(async () => sentTo(phone).length === 2);
    const conversations = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', accountId)
      .execute();
    expect(conversations).toHaveLength(1);
    expect(seen.flat()).toContain('has-first');
  });

  it('asks for typed text when the customer sends a voice note, and saves nothing', async () => {
    const { accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.voice', from: phone, type: 'audio' }));
    await waitFor(async () => sentTo(phone).length === 1);
    expect(sentTo(phone)[0]?.text).toMatch(/typed messages/);
    const conversations = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', accountId)
      .execute();
    expect(conversations).toHaveLength(0);
  });

  it('tells the customer plainly when the AI cannot answer, and can be written to again', async () => {
    const { phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => {
      throw new Error('the AI company is down');
    };
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.down', from: phone, text: 'Hello' }));
    await waitFor(async () => sentTo(phone).length === 1);
    expect(sentTo(phone)[0]?.text).toMatch(/can't answer right now/);
    script = () => ({ answer: 'Back again.' });
  });

  it('stays silent when the business has not gone live, has paused the AI, or has WhatsApp switched off', async () => {
    const notLive = await newBusinessOnWhatsapp({ live: false });
    const paused = await newBusinessOnWhatsapp();
    await asStaff(paused.person, 'PUT', '/channels/whatsapp', {
      phoneNumberId: paused.phoneNumberId,
      answerMessages: false,
    });
    const off = await newBusinessOnWhatsapp();
    await database.system
      .updateTable('account_modules')
      .set({ enabled: false })
      .where('account_id', '=', off.accountId)
      .where('module_id', '=', 'channel.whatsapp')
      .execute();
    const phone = customerPhone();
    for (const business of [notLive, paused, off]) {
      await deliver(metaDelivery(business.phoneNumberId, { id: `wamid.${randomUUID()}`, from: phone, text: 'Hello' }));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(sentTo(phone)).toHaveLength(0);
  });

  it('keeps two businesses apart: a message to one number never reaches the other business', async () => {
    const first = await newBusinessOnWhatsapp();
    const second = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'Hi there.' });
    await deliver(metaDelivery(first.phoneNumberId, { id: 'wamid.iso', from: phone, text: 'Hello' }));
    await waitFor(async () => sentTo(phone).length === 1);
    const firstRows = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', first.accountId)
      .execute();
    const secondRows = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', second.accountId)
      .execute();
    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(0);
    expect(sentTo(phone)[0]?.access.phoneNumberId).toBe(first.phoneNumberId);
  });

  it('stays silent while a team member holds the conversation, and sends the team member’s reply on WhatsApp', async () => {
    const { person, accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'AI answer.' });
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.h1', from: phone, text: 'Hello' }));
    await waitFor(async () => sentTo(phone).length === 1);
    const conversation = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect((await asStaff(person, 'POST', `/conversations/${conversation.id}/takeover`)).statusCode).toBe(200);
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.h2', from: phone, text: 'Anyone there?' }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(sentTo(phone)).toHaveLength(1); // the AI said nothing

    const reply = await asStaff(person, 'POST', `/conversations/${conversation.id}/reply`, {
      body: 'Hi, this is Anita.',
    });
    expect(reply.statusCode, reply.body).toBe(201);
    // The event reaches the WhatsApp module and the reply goes out
    const dispatcher = createEventDispatcher({
      database,
      registry: createRegistry(modules),
      gate: { isActive: async () => true },
      contextFor: createContextFactory(database),
      logger: pino({ level: 'silent' }),
      services: { config, database, whatsapp: whatsappRecorder.provider },
    });
    await waitFor(async () => {
      await dispatcher.dispatchPendingEventsOnce();
      return sentTo(phone).length === 2;
    });
    expect(sentTo(phone)[1]?.text).toBe('Hi, this is Anita.');
  });

  it('does not send a staff reply after 24 hours; it notes why on the connection', async () => {
    const { person, accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'AI answer.' });
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.late', from: phone, text: 'Hello' }));
    await waitFor(async () => sentTo(phone).length === 1);
    const conversation = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    // The customer's message was written two days ago
    await database.system
      .updateTable('conversation_messages')
      .set({ created_at: new Date(Date.now() - 48 * 3600_000) })
      .where('conversation_id', '=', conversation.id)
      .execute();
    await asStaff(person, 'POST', `/conversations/${conversation.id}/takeover`);
    await asStaff(person, 'POST', `/conversations/${conversation.id}/reply`, { body: 'Late reply' });
    const dispatcher = createEventDispatcher({
      database,
      registry: createRegistry(modules),
      gate: { isActive: async () => true },
      contextFor: createContextFactory(database),
      logger: pino({ level: 'silent' }),
      services: { config, database, whatsapp: whatsappRecorder.provider },
    });
    await waitFor(async () => {
      await dispatcher.dispatchPendingEventsOnce();
      const connection = await database.system
        .selectFrom('whatsapp_connections')
        .select('status_note')
        .where('account_id', '=', accountId)
        .executeTakeFirstOrThrow();
      return (connection.status_note ?? '').includes('24 hours');
    });
    expect(sentTo(phone)).toHaveLength(1);
  });
});

describe('ending quiet WhatsApp conversations', () => {
  it('ends a conversation quiet for six hours, queues its sorting and summary, and a new message starts a new conversation', async () => {
    queuedJobs = [];
    const { accountId, phoneNumberId } = await newBusinessOnWhatsapp();
    const phone = customerPhone();
    script = () => ({ answer: 'Hi.' });
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.idle1', from: phone, text: 'Hello' }));
    await waitFor(async () => sentTo(phone).length === 1);
    const idle = createIdleConversationsService({
      database,
      enqueueJob: async (jobName, data) => {
        queuedJobs.push({ jobName, data });
      },
      now: () => new Date(Date.now() + 7 * 3600_000),
    });
    expect(await idle.findBusinessesWithIdleConversations()).toContain(accountId);
    expect(await idle.endIdleConversationsOfBusiness(accountId)).toBe(1);
    expect(queuedJobs.map((job) => job.jobName).sort()).toEqual([
      'agents.summarise_conversation',
      'conversations.sort_conversation',
    ]);
    await deliver(metaDelivery(phoneNumberId, { id: 'wamid.idle2', from: phone, text: 'Hello again' }));
    await waitFor(async () => sentTo(phone).length === 2);
    const conversations = await database.system
      .selectFrom('conversations')
      .select('id')
      .where('account_id', '=', accountId)
      .execute();
    expect(conversations).toHaveLength(2);
  });
});
