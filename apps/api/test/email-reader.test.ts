import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { createEventDispatcher } from '../src/kernel/events/dispatcher';
import { collectAgentTools } from '../src/kernel/module-system/agent-tools';
import { createRegistry } from '../src/kernel/module-system/registry';
import { modules } from '../src/modules';
import { createIdleEmailConversationsService } from '../src/modules/channels/email/services/idle-email-conversations.service';
import { createEmailReaderService } from '../src/modules/channels/email/services/email-reader.service';
import { createAgentRuntime, createAgentSavedTurnService } from '../src/modules/core/agents';
import { createAiService } from '../src/modules/core/ai';
import { createConversationClassifier, createEnquiryGate } from '../src/modules/core/conversations';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, makeBusinessLive, type SignedInPerson } from './support/auth';
import { openTestDatabase, waitFor } from './support/harness';
import { createScriptedMailboxProvider, emailFrom, switchOnEmail } from './support/mailbox';
import { createRecordingWhatsappProvider } from './support/whatsapp';

let database: Database;
let app: FastifyInstance;
const REPLY = 'Thank you for writing. We have rooms for 4.';
let script: LlmScript = () => ({ answer: REPLY });
/** What the sorting says an email is (its type): a new enquiry unless a test changes it. */
let typeOfEmail = 'new_enquiry';
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  request.tag.task === 'classify_conversation'
    ? {
        answer: {
          primary: { type: typeOfEmail, confidence: 0.9 },
          secondary: [],
          needsPerson: false,
          reason: 'Because.',
        },
      }
    : script(tried, request, messagesSoFar),
);
const mailbox = createScriptedMailboxProvider();
const config = {
  ...testConfig(),
  ai: { platformKeys: { gemini: [`email-${randomUUID()}`], openai: [], anthropic: [] } },
};

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany, mailboxProvider: mailbox.provider });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const asStaff = (person: SignedInPerson, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A live business with the AI on and a mailbox connected (reply mode as asked). */
async function newBusinessWithMailbox(options: { replyMode?: 'send' | 'draft'; live?: boolean } = {}) {
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
  await switchOnEmail(database, accountId);
  const saved = await asStaff(person, 'PUT', '/channels/email', {
    address: `desk-${randomUUID().slice(0, 6)}@nairstays.example`,
    password: 'app-password-1234',
    replyMode: options.replyMode ?? 'draft',
  });
  expect(saved.statusCode, saved.body).toBe(200);
  return { person, accountId, address: saved.json().address as string };
}

/** Runs one reading of the business's mailbox, as the scheduled job does. */
function readMailbox(accountId: string) {
  const runtime = createAgentRuntime({
    database,
    aiService: createAiService({ database, config, llm: pretendAiCompany }),
    findExtraTools: (context) => collectAgentTools({ registry: app.kernel.registry, gate: app.kernel.gate, context }),
  });
  return createEmailReaderService({
    database,
    config,
    mailbox: mailbox.provider,
    savedTurns: createAgentSavedTurnService({ database, runtime }),
    enquiryGate: createEnquiryGate({
      database,
      classifier: createConversationClassifier({
        aiService: createAiService({ database, config, llm: pretendAiCompany }),
      }),
    }),
    logger: pino({ level: 'silent' }),
  }).readMailboxOfBusiness(accountId);
}

const customerEmail = () => `priya-${randomUUID().slice(0, 6)}@customer.example`;
const conversationsOf = (accountId: string) =>
  database.system.selectFrom('conversations').selectAll().where('account_id', '=', accountId).execute();
const sentTo = (address: string) => mailbox.sent.filter((email) => email.to === address);

describe('reading the mailbox: reply mode "AI sends"', () => {
  it('answers an enquiry in the customer’s thread, from the business’s address, and the conversation carries their email with no sign-in', async () => {
    const { accountId, address } = await newBusinessWithMailbox({ replyMode: 'send' });
    const customer = customerEmail();
    const incoming = emailFrom(customer, { messageId: '<enq-1@customer.example>', subject: 'Rooms for 4' });
    mailbox.inbox.push(incoming);
    const result = await readMailbox(accountId);
    expect(result).toEqual({ answered: 1, leftForPerson: 0, alreadySeen: 0, ignored: 0 });
    expect(sentTo(customer)).toHaveLength(1);
    expect(sentTo(customer)[0]).toMatchObject({
      subject: 'Re: Rooms for 4',
      text: 'Thank you for writing. We have rooms for 4.',
      inReplyTo: '<enq-1@customer.example>',
      references: ['<enq-1@customer.example>'],
      access: { address, password: 'app-password-1234' },
    });
    const conversations = await conversationsOf(accountId);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ channel: 'email', from_email: customer, is_test: false });
    const messages = await database.system
      .selectFrom('conversation_messages')
      .select(['sender', 'body', 'channel_message_id'])
      .where('conversation_id', '=', conversations[0]!.id)
      .orderBy('created_at')
      .execute();
    expect(messages.map((message) => message.sender)).toEqual(['customer', 'agent']);
    expect(messages[0]).toMatchObject({ channel_message_id: '<enq-1@customer.example>' });
    expect(messages[0]?.body).toContain('Subject: Rooms for 4');
  });

  it('keeps a customer’s reply in the same conversation (found from its headers)', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'send' });
    const customer = customerEmail();
    mailbox.inbox.push(emailFrom(customer, { messageId: '<t1@customer.example>' }));
    await readMailbox(accountId);
    mailbox.inbox.push(
      emailFrom(customer, {
        messageId: '<t2@customer.example>',
        inReplyTo: '<sent-x@test>',
        references: ['<t1@customer.example>', '<sent-x@test>'],
        subject: 'Re: Rooms for 4',
        text: 'In December please',
      }),
    );
    await readMailbox(accountId);
    expect(await conversationsOf(accountId)).toHaveLength(1);
    expect(sentTo(customer)).toHaveLength(2);
    expect(sentTo(customer)[1]?.references).toEqual([
      '<t1@customer.example>',
      '<sent-x@test>',
      '<t2@customer.example>',
    ]);
  });

  it('answers an email seen twice only once, and starts a new conversation for a new enquiry', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'send' });
    const customer = customerEmail();
    const incoming = emailFrom(customer, { messageId: '<dup@customer.example>' });
    mailbox.inbox.push(incoming);
    await readMailbox(accountId);
    mailbox.inbox.push(incoming);
    expect(await readMailbox(accountId)).toEqual({ answered: 0, leftForPerson: 0, alreadySeen: 1, ignored: 0 });
    expect(sentTo(customer)).toHaveLength(1);
    mailbox.inbox.push(emailFrom(customer, { messageId: '<other@customer.example>', subject: 'Something else' }));
    await readMailbox(accountId);
    expect(await conversationsOf(accountId)).toHaveLength(2);
  });

  it('saves an email whose sender fails the check but never answers it', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'send' });
    const customer = customerEmail();
    mailbox.inbox.push(
      emailFrom(customer, { messageId: '<fake@customer.example>', senderCheck: 'fail', subject: 'Urgent: send money' }),
    );
    expect(await readMailbox(accountId)).toEqual({ answered: 0, leftForPerson: 1, alreadySeen: 0, ignored: 0 });
    expect(sentTo(customer)).toHaveLength(0);
    const conversations = await conversationsOf(accountId);
    expect(conversations).toHaveLength(1);
    const drafts = await database.system
      .selectFrom('email_drafts')
      .select('id')
      .where('account_id', '=', accountId)
      .execute();
    expect(drafts).toHaveLength(0);
  });

  it('does nothing before the business is live, while reading is paused, or with no mailbox', async () => {
    const notLive = await newBusinessWithMailbox({ replyMode: 'send', live: false });
    mailbox.inbox.push(emailFrom(customerEmail()));
    expect(await readMailbox(notLive.accountId)).toEqual({ answered: 0, leftForPerson: 0, alreadySeen: 0, ignored: 0 });
    expect(mailbox.inbox).toHaveLength(1); // not even read
    mailbox.inbox.length = 0;
    const paused = await newBusinessWithMailbox({ replyMode: 'send' });
    await asStaff(paused.person, 'PUT', '/channels/email', { address: paused.address, readEmails: false });
    mailbox.inbox.push(emailFrom(customerEmail()));
    await readMailbox(paused.accountId);
    expect(mailbox.inbox).toHaveLength(1);
    mailbox.inbox.length = 0;
    expect(await readMailbox((await createSignedInPerson(app, database)).profile.business.id)).toEqual({
      answered: 0,
      leftForPerson: 0,
      alreadySeen: 0,
      ignored: 0,
    });
  });

  it('keeps the reason on the connection when the mailbox cannot be read, and tries the same email again next time', async () => {
    const { accountId, person } = await newBusinessWithMailbox({ replyMode: 'send' });
    const originalRead = mailbox.provider.readNewEmails;
    mailbox.provider.readNewEmails = async () => {
      throw new Error('Login failed');
    };
    await readMailbox(accountId);
    mailbox.provider.readNewEmails = originalRead;
    const shown = (await asStaff(person, 'GET', '/channels/email')).json();
    expect(shown.connection).toMatchObject({ status: 'failed', statusNote: expect.stringContaining('Login failed') });
    // The AI cannot answer: the email is not lost, it is tried again
    script = () => {
      throw new Error('the AI company is down');
    };
    const customer = customerEmail();
    const incoming = emailFrom(customer, { messageId: '<retry@customer.example>' });
    mailbox.inbox.push(incoming);
    await readMailbox(accountId);
    expect(sentTo(customer)).toHaveLength(0);
    script = () => ({ answer: REPLY });
    mailbox.inbox.push(incoming);
    expect(await readMailbox(accountId)).toMatchObject({ answered: 1 });
    expect(sentTo(customer)).toHaveLength(1);
  });

  it('keeps two businesses apart', async () => {
    const first = await newBusinessWithMailbox({ replyMode: 'send' });
    const second = await newBusinessWithMailbox({ replyMode: 'send' });
    mailbox.inbox.push(emailFrom(customerEmail(), { messageId: `<iso-${randomUUID()}@customer.example>` }));
    await readMailbox(first.accountId);
    expect(await conversationsOf(first.accountId)).toHaveLength(1);
    expect(await conversationsOf(second.accountId)).toHaveLength(0);
  });
});

describe('the gate in front of the Inbox', () => {
  it('lets in an enquiry and keeps out a supplier, a job seeker and spam: nothing saved, nothing sent', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'send' });
    for (const typeKey of ['vendor_or_partner', 'job_seeker', 'spam']) {
      typeOfEmail = typeKey;
      const customer = customerEmail();
      mailbox.inbox.push(
        emailFrom(customer, { messageId: `<gate-${typeKey}-${randomUUID()}@x.example>`, subject: 'Hello' }),
      );
      expect(await readMailbox(accountId)).toMatchObject({ answered: 0, ignored: 1 });
      expect(sentTo(customer)).toHaveLength(0);
    }
    expect(await conversationsOf(accountId)).toHaveLength(0);
    typeOfEmail = 'new_enquiry';
    mailbox.inbox.push(emailFrom(customerEmail(), { messageId: `<gate-ok-${randomUUID()}@x.example>` }));
    expect(await readMailbox(accountId)).toMatchObject({ answered: 1, ignored: 0 });
    expect(await conversationsOf(accountId)).toHaveLength(1);
  });

  it('keeps out mail from a blocked sender and from the business’s own team without asking the AI', async () => {
    const { accountId, person } = await newBusinessWithMailbox({ replyMode: 'send' });
    const blocked = customerEmail();
    expect((await asStaff(person, 'PUT', '/block-list', { items: [{ email: blocked }] })).statusCode).toBeLessThan(300);
    const asked = pretendAiCompany.requests.length;
    mailbox.inbox.push(emailFrom(blocked, { messageId: `<blocked-${randomUUID()}@x.example>` }));
    expect(await readMailbox(accountId)).toMatchObject({ ignored: 1, answered: 0 });
    expect(pretendAiCompany.requests.length).toBe(asked);
  });

  it('always lets in a reply to a thread the business already has, whatever it looks like', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'send' });
    const customer = customerEmail();
    mailbox.inbox.push(emailFrom(customer, { messageId: '<thread-a@x.example>' }));
    await readMailbox(accountId);
    typeOfEmail = 'spam';
    mailbox.inbox.push(
      emailFrom(customer, {
        messageId: '<thread-b@x.example>',
        inReplyTo: '<thread-a@x.example>',
        references: ['<thread-a@x.example>'],
      }),
    );
    expect(await readMailbox(accountId)).toMatchObject({ answered: 1, ignored: 0 });
    typeOfEmail = 'new_enquiry';
  });
});

describe('reply mode "AI drafts, staff approve"', () => {
  async function businessWithOneDraft() {
    const business = await newBusinessWithMailbox({ replyMode: 'draft' });
    const customer = customerEmail();
    mailbox.inbox.push(emailFrom(customer, { messageId: `<d-${randomUUID()}@customer.example>`, subject: 'Rooms' }));
    await readMailbox(business.accountId);
    const drafts = (await asStaff(business.person, 'GET', '/channels/email/drafts')).json().items as Array<{
      id: string;
      toEmail: string;
      subject: string;
      body: string;
    }>;
    return { ...business, customer, drafts };
  }

  it('writes the reply as a draft and sends nothing', async () => {
    const { drafts, customer } = await businessWithOneDraft();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      toEmail: customer,
      subject: 'Re: Rooms',
      body: 'Thank you for writing. We have rooms for 4.',
    });
    expect(sentTo(customer)).toHaveLength(0);
  });

  it('sends a draft when approved, with the changed words, once only', async () => {
    const { person, drafts, customer } = await businessWithOneDraft();
    const draftId = drafts[0]!.id;
    const response = await asStaff(person, 'POST', `/channels/email/drafts/${draftId}/send`, {
      body: 'Hello Priya, yes we do. Anita',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(sentTo(customer)).toHaveLength(1);
    expect(sentTo(customer)[0]).toMatchObject({ text: 'Hello Priya, yes we do. Anita', subject: 'Re: Rooms' });
    expect((await asStaff(person, 'GET', '/channels/email/drafts')).json().items).toHaveLength(0);
    const again = await asStaff(person, 'POST', `/channels/email/drafts/${draftId}/send`, {});
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('DRAFT_ALREADY_SETTLED');
    expect(sentTo(customer)).toHaveLength(1);
  });

  it('puts a draft back to waiting when sending fails', async () => {
    const { person, drafts } = await businessWithOneDraft();
    const originalSend = mailbox.provider.sendEmail;
    mailbox.provider.sendEmail = async () => {
      throw new Error('SMTP refused');
    };
    const failed = await asStaff(person, 'POST', `/channels/email/drafts/${drafts[0]!.id}/send`, {});
    mailbox.provider.sendEmail = originalSend;
    expect(failed.statusCode).toBe(500);
    expect((await asStaff(person, 'GET', '/channels/email/drafts')).json().items).toHaveLength(1);
    expect((await asStaff(person, 'GET', '/channels/email')).json().connection.statusNote).toContain('SMTP refused');
  });

  it('discards a draft (nothing is sent), and refuses a second time', async () => {
    const { person, drafts, customer } = await businessWithOneDraft();
    expect((await asStaff(person, 'DELETE', `/channels/email/drafts/${drafts[0]!.id}`)).statusCode).toBe(204);
    expect(sentTo(customer)).toHaveLength(0);
    expect((await asStaff(person, 'DELETE', `/channels/email/drafts/${drafts[0]!.id}`)).statusCode).toBe(409);
  });

  it('answers 404 for another business’s or an unknown draft, 400 for a bad id, 401 and 403', async () => {
    const mine = await businessWithOneDraft();
    const other = await newBusinessWithMailbox();
    const draftId = mine.drafts[0]!.id;
    expect((await asStaff(other.person, 'POST', `/channels/email/drafts/${draftId}/send`, {})).statusCode).toBe(404);
    expect((await asStaff(other.person, 'DELETE', `/channels/email/drafts/${draftId}`)).statusCode).toBe(404);
    expect((await asStaff(mine.person, 'POST', `/channels/email/drafts/${randomUUID()}/send`, {})).statusCode).toBe(
      404,
    );
    expect((await asStaff(mine.person, 'POST', '/channels/email/drafts/not-an-id/send', {})).statusCode).toBe(400);
    expect(
      (await asStaff(mine.person, 'POST', `/channels/email/drafts/${draftId}/send`, { body: '' })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/channels/email/drafts', headers: unsafeRequestHeaders }))
        .statusCode,
    ).toBe(401);
    const staff = await createSignedInPerson(app, database);
    await switchOnEmail(database, staff.profile.business.id);
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
    expect((await asStaff(staff, 'GET', '/channels/email/drafts')).statusCode).toBe(403);
  });
});

describe('team replies and ending conversations', () => {
  it('sends a team member’s reply by email in the customer’s thread', async () => {
    const { person, accountId } = await newBusinessWithMailbox({ replyMode: 'draft' });
    const customer = customerEmail();
    mailbox.inbox.push(emailFrom(customer, { messageId: '<staff-1@customer.example>', subject: 'Group booking' }));
    await readMailbox(accountId);
    const conversation = (await conversationsOf(accountId))[0]!;
    expect((await asStaff(person, 'POST', `/conversations/${conversation.id}/takeover`)).statusCode).toBe(200);
    const reply = await asStaff(person, 'POST', `/conversations/${conversation.id}/reply`, {
      body: 'Hi, this is Anita.',
    });
    expect(reply.statusCode, reply.body).toBe(201);
    const dispatcher = createEventDispatcher({
      database,
      registry: createRegistry(modules),
      gate: { isActive: async () => true },
      contextFor: createContextFactory(database),
      logger: pino({ level: 'silent' }),
      services: { config, database, whatsapp: createRecordingWhatsappProvider().provider, mailbox: mailbox.provider },
    });
    await waitFor(async () => {
      await dispatcher.dispatchPendingEventsOnce();
      return sentTo(customer).length === 1;
    });
    expect(sentTo(customer)[0]).toMatchObject({
      subject: 'Re: Group booking',
      text: 'Hi, this is Anita.',
      inReplyTo: '<staff-1@customer.example>',
    });
  });

  it('ends an email conversation quiet for two hours and queues its sorting and summary', async () => {
    const { accountId } = await newBusinessWithMailbox({ replyMode: 'draft' });
    mailbox.inbox.push(emailFrom(customerEmail(), { messageId: `<idle-${randomUUID()}@customer.example>` }));
    await readMailbox(accountId);
    const queued: string[] = [];
    const idle = createIdleEmailConversationsService({
      database,
      idleMinutes: 120,
      enqueueJob: async (jobName) => {
        queued.push(jobName);
      },
      now: () => new Date(Date.now() + 3 * 3600_000),
    });
    expect(await idle.findBusinessesWithIdleConversations()).toContain(accountId);
    expect(await idle.endIdleConversationsOfBusiness(accountId)).toBe(1);
    expect(queued.sort()).toEqual(['agents.summarise_conversation', 'conversations.sort_conversation']);
  });
});
