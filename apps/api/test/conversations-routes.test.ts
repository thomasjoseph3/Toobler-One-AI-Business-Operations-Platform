import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createAiService } from '../src/modules/core/ai';
import {
  createConversationClassifier,
  createConversationFinaliser,
  createConversationRecordsService,
} from '../src/modules/core/conversations';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

let nextAnswer: unknown;
const pretendAiCompany = createScriptedLlmProvider(() => ({ answer: nextAnswer }));
const answerFor = (primary: string, confidence = 0.9, extra: Record<string, unknown> = {}) => ({
  primary: { type: primary, confidence },
  secondary: [],
  needsPerson: false,
  reason: 'A short reason without personal details.',
  ...extra,
});

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`routes-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const records = () => createConversationRecordsService({ database });
const finaliser = () =>
  createConversationFinaliser({
    database,
    classifier: createConversationClassifier({
      aiService: createAiService({ database, config: app.kernel.config, llm: app.kernel.llm }),
    }),
  });

const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  url: string,
  payload?: unknown,
  withCsrfHeaders = true,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

async function newBusiness(): Promise<{ accountId: string; manager: SignedInPerson }> {
  const manager = await createSignedInPerson(app, database);
  const accountId = manager.profile.business.id;
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
  return { accountId, manager };
}

const uniqueDigits = () => `9198${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** A conversation from a person with the customer's words, sorted by the pretend AI's answer, with lead and ticket made. */
async function sortedConversation(
  accountId: string,
  who: { fromPhoneKey?: string; fromEmail?: string },
  answer: unknown,
  options: { channel?: 'webchat' | 'whatsapp' | 'email' | 'phone'; words?: string } = {},
) {
  const conversationId = await records().startConversation(accountId, {
    channel: options.channel ?? 'whatsapp',
    ...who,
  });
  await records().addMessage(accountId, conversationId, {
    sender: 'customer',
    body: options.words ?? 'Hello, I would like to know more.',
  });
  nextAnswer = answer;
  const result = await finaliser().finaliseConversation(accountId, conversationId);
  return { conversationId, result };
}

const leadRow = (leadId: string) =>
  database.system.selectFrom('leads').selectAll().where('id', '=', leadId).executeTakeFirstOrThrow();
const ticketRow = (ticketId: string) =>
  database.system.selectFrom('tickets').selectAll().where('id', '=', ticketId).executeTakeFirstOrThrow();
const conversationRow = (conversationId: string) =>
  database.system.selectFrom('conversations').selectAll().where('id', '=', conversationId).executeTakeFirstOrThrow();
const contactRow = (contactId: string) =>
  database.system.selectFrom('contacts').selectAll().where('id', '=', contactId).executeTakeFirstOrThrow();
const correctionsOf = (conversationId: string) =>
  database.system
    .selectFrom('classification_corrections')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .execute();
const eventsNamed = (accountId: string, name: string) =>
  database.system
    .selectFrom('domain_events')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('name', '=', name)
    .execute();
const correct = (person: SignedInPerson, conversationId: string, typeKey: string) =>
  send(person, 'POST', `/conversations/${conversationId}/type`, { typeKey });

describe('GET /api/v1/conversations/{id}', () => {
  it('shows the conversation: who, the contact, the type and why, the messages in order, and what it led to', async () => {
    const { accountId, manager } = await newBusiness();
    const phoneKey = uniqueDigits();
    const conversationId = await records().startConversation(accountId, {
      channel: 'whatsapp',
      fromPhoneKey: phoneKey,
    });
    await records().addMessage(accountId, conversationId, {
      sender: 'customer',
      body: 'Do you have a room on 20 December?',
    });
    await records().addMessage(accountId, conversationId, { sender: 'agent', body: 'Yes, for how many nights?' });
    await records().addMessage(accountId, conversationId, { sender: 'customer', body: 'Three nights.' });
    nextAnswer = answerFor('new_enquiry', 0.9, { reason: 'Asks about a room.' });
    const result = await finaliser().finaliseConversation(accountId, conversationId);

    const response = await send(manager, 'GET', `/conversations/${conversationId}`);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      id: conversationId,
      channel: 'whatsapp',
      fromPhone: `+${phoneKey}`,
      fromEmail: null,
      status: 'sorted',
      needsPerson: false,
      type: {
        key: 'new_enquiry',
        label: 'New enquiry',
        source: 'ai_final',
        reason: 'Asks about a room.',
        aiUnsure: false,
      },
    });
    expect(body.type.confidence).toBeCloseTo(0.9);
    expect(body.contact).toMatchObject({ phone: `+${phoneKey}`, name: null });
    expect(body.messages.map((message: { sender: string; body: string }) => [message.sender, message.body])).toEqual([
      ['customer', 'Do you have a room on 20 December?'],
      ['agent', 'Yes, for how many nights?'],
      ['customer', 'Three nights.'],
    ]);
    expect(body.outcomes).toHaveLength(1);
    expect(body.outcomes[0]).toMatchObject({
      typeKey: 'new_enquiry',
      typeLabel: 'New enquiry',
      kind: 'lead',
      leadId: result.outcomes[0]!.leadId,
      ticketId: null,
      carriedOut: true,
      isCurrent: true,
    });
  });

  it("shows no type for a conversation that is still open, and the business's own word for a type", async () => {
    const { accountId, manager } = await newBusiness();
    const openConversation = await records().startConversation(accountId, { channel: 'webchat' });
    const open = (await send(manager, 'GET', `/conversations/${openConversation}`)).json();
    expect(open).toMatchObject({ status: 'open', type: null, sortedAt: null });

    const types = (await send(manager, 'GET', '/conversation-types')).json().items as Array<{
      id: string;
      key: string;
    }>;
    await send(manager, 'PATCH', `/conversation-types/${types.find((type) => type.key === 'new_enquiry')!.id}`, {
      label: 'Booking request',
    });
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    const sorted = (await send(manager, 'GET', `/conversations/${conversationId}`)).json();
    expect(sorted.type.label).toBe('Booking request');
    expect(sorted.outcomes[0].typeLabel).toBe('Booking request');
  });

  it('can be read by staff, but not by the "own leads only" role', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    await setRole(manager, 'staff');
    expect((await send(manager, 'GET', `/conversations/${conversationId}`)).statusCode).toBe(200);
    await setRole(manager, 'staff_own');
    expect((await send(manager, 'GET', `/conversations/${conversationId}`)).statusCode).toBe(403);
  });

  it("answers 404 for an unknown conversation and for another business's, 400 for a bad id, and 401 for nobody", async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    const { conversationId } = await sortedConversation(
      first.accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    expect((await send(first.manager, 'GET', `/conversations/${randomUUID()}`)).statusCode).toBe(404);
    expect((await send(second.manager, 'GET', `/conversations/${conversationId}`)).statusCode).toBe(404);
    expect((await send(first.manager, 'GET', '/conversations/not-a-uuid')).statusCode).toBe(400);
    expect((await send(null, 'GET', `/conversations/${conversationId}`)).statusCode).toBe(401);
  });
});

describe('POST /api/v1/conversations/{id}/type (a person corrects the type)', () => {
  it('turns a lead into a ticket: the lead made by the conversation is taken off the board (kept, lost as reclassified), a ticket opens, and the person is no longer a "lead"', async () => {
    const { accountId, manager } = await newBusiness();
    const secret = `secret-${randomUUID()}`;
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
      {
        words: `My AC broke last night. ${secret}`,
      },
    );
    const leadId = result.outcomes[0]!.leadId!;
    const contactId = (await conversationRow(conversationId)).contact_id!;
    expect((await contactRow(contactId)).lifecycle_stage).toBe('lead');

    const response = await correct(manager, conversationId, 'complaint');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: 'sorted',
      needsPerson: true,
      type: { key: 'complaint', source: 'staff', confidence: 1, aiUnsure: false },
    });
    const outcomes = body.outcomes as Array<{
      typeKey: string;
      kind: string;
      ticketId: string | null;
      isCurrent: boolean;
      carriedOut: boolean;
    }>;
    expect(outcomes.find((outcome) => outcome.typeKey === 'new_enquiry')).toMatchObject({
      kind: 'lead',
      isCurrent: false,
    });
    const complaint = outcomes.find((outcome) => outcome.typeKey === 'complaint')!;
    expect(complaint).toMatchObject({ kind: 'ticket', isCurrent: true, carriedOut: true });
    expect(await ticketRow(complaint.ticketId!)).toMatchObject({
      type: 'complaint',
      priority: 'high',
      status: 'open',
      conversation_type_key: 'complaint',
    });

    // The lead is kept, off the board
    const lead = await leadRow(leadId);
    expect(lead).toMatchObject({ lost_reason: 'Reclassified (not a sale)' });
    expect(lead.closed_at).not.toBeNull();
    expect((await contactRow(contactId)).lifecycle_stage).toBe('new');

    const corrections = await correctionsOf(conversationId);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      from_type_key: 'new_enquiry',
      to_type_key: 'complaint',
      by_user_id: manager.profile.user.id,
    });
    expect(await eventsNamed(accountId, 'conversation.type_corrected')).toHaveLength(1);
    expect(await eventsNamed(accountId, 'lead.reclassified')).toHaveLength(1);
    const log = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(
      log.some(
        (line) => line.kind === 'conversations.type_corrected' && (line.actor as { kind: string }).kind === 'user',
      ),
    ).toBe(true);
    expect(JSON.stringify(log)).not.toContain(secret);
    expect(JSON.stringify(await eventsNamed(accountId, 'conversation.type_corrected'))).not.toContain(secret);
  });

  it('turns a ticket into a lead: the ticket made by the conversation is closed with a note, and a lead opens', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromEmail: 'guest@example.com' },
      answerFor('complaint'),
      { channel: 'email' },
    );
    const ticketId = result.outcomes[0]!.ticketId!;
    const response = await correct(manager, conversationId, 'new_enquiry');
    expect(response.statusCode, response.body).toBe(200);
    const ticket = await ticketRow(ticketId);
    expect(ticket.status).toBe('done');
    const notes = await database.system
      .selectFrom('ticket_notes')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .execute();
    expect(notes.map((note) => note.body)).toEqual([
      'Closed: staff changed the type of the conversation from Complaint to New enquiry.',
    ]);
    const leadOutcome = (response.json().outcomes as Array<{ typeKey: string; leadId: string | null }>).find(
      (outcome) => outcome.typeKey === 'new_enquiry',
    )!;
    expect(leadOutcome.leadId).not.toBeNull();
    expect(await leadRow(leadOutcome.leadId!)).toMatchObject({ closed_at: null, first_channel: 'email' });
  });

  it('brings a filtered conversation back: spam becomes an enquiry, with a contact and a lead', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(accountId, { fromPhoneKey: uniqueDigits() }, answerFor('spam'));
    expect((await conversationRow(conversationId)).contact_id).toBeNull();
    const response = await correct(manager, conversationId, 'new_enquiry');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().contact).not.toBeNull();
    expect(
      response.json().outcomes.find((outcome: { typeKey: string }) => outcome.typeKey === 'new_enquiry'),
    ).toMatchObject({ kind: 'lead', carriedOut: true });
  });

  it('leaves a lead alone that the conversation only joined, and one that another conversation also joined', async () => {
    const { accountId, manager } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    const second = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    const leadId = first.result.outcomes[0]!.leadId!;
    expect(second.result.outcomes[0]!.leadId).toBe(leadId);

    // The second only joined the lead: correcting it leaves the lead open
    await correct(manager, second.conversationId, 'vendor_or_partner');
    expect((await leadRow(leadId)).closed_at).toBeNull();
    // The first made the lead, but the second conversation's outcome is no longer current, so now only the first is linked: correcting it closes it
    await correct(manager, first.conversationId, 'vendor_or_partner');
    expect((await leadRow(leadId)).closed_at).not.toBeNull();
  });

  it('does not close a lead the conversation made while another conversation still counts on it', async () => {
    const { accountId, manager } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    await sortedConversation(accountId, who, answerFor('new_enquiry'));
    await correct(manager, first.conversationId, 'vendor_or_partner');
    expect((await leadRow(first.result.outcomes[0]!.leadId!)).closed_at).toBeNull();
  });

  it('confirms a type the AI was only fairly sure about, without changing anything else, and is not counted as a correction', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry', 0.55),
    );
    expect(result.aiUnsure).toBe(true);
    const response = await correct(manager, conversationId, 'new_enquiry');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ type: { key: 'new_enquiry', source: 'staff', aiUnsure: false } });
    expect(response.json().outcomes[0]).toMatchObject({ aiUnsure: false, leadId: result.outcomes[0]!.leadId });
    expect(await correctionsOf(conversationId)).toHaveLength(0);
    const log = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', conversationId)
      .where('kind', '=', 'conversations.type_confirmed')
      .execute();
    expect(log).toHaveLength(1);
  });

  it('changes nothing when the type is already that and the AI was sure', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    const response = await correct(manager, conversationId, 'new_enquiry');
    expect(response.json().type).toMatchObject({ source: 'ai_final' });
    expect(await correctionsOf(conversationId)).toHaveLength(0);
  });

  it('records one correction when two people set the same type at the same moment', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    const answers = await Promise.all([
      correct(manager, conversationId, 'complaint'),
      correct(manager, conversationId, 'complaint'),
    ]);
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200]);
    expect(await correctionsOf(conversationId)).toHaveLength(1);
    const outcomes = await database.system
      .selectFrom('conversation_outcomes')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .execute();
    expect(outcomes.filter((outcome) => outcome.superseded_at === null)).toHaveLength(1);
  });

  it('answers 400 UNKNOWN_TYPE for a type the business does not have or has switched off, and changes nothing', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    const created = (
      await send(manager, 'POST', '/conversation-types', { label: 'Old reason', description: 'x', outcome: 'log' })
    ).json();
    await send(manager, 'PATCH', `/conversation-types/${created.id}`, { isActive: false });
    for (const typeKey of ['made_up_type', created.key]) {
      const response = await correct(manager, conversationId, typeKey);
      expect(response.statusCode, typeKey).toBe(400);
      expect(response.json().error.code).toBe('UNKNOWN_TYPE');
    }
    expect((await conversationRow(conversationId)).type_key).toBe('new_enquiry');
    expect(await correctionsOf(conversationId)).toHaveLength(0);
  });

  it('answers 409 while the conversation is not sorted yet', async () => {
    const { accountId, manager } = await newBusiness();
    const conversationId = await records().startConversation(accountId, { channel: 'webchat' });
    const response = await correct(manager, conversationId, 'complaint');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONVERSATION_NOT_SORTED');
  });

  it('answers 404 for another business\'s conversation, 403 for the "own leads only" role, 401 for nobody, 403 without the safety headers, and 400 for bad input', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    const { conversationId } = await sortedConversation(
      first.accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    expect((await correct(second.manager, conversationId, 'complaint')).statusCode).toBe(404);
    expect((await correct(first.manager, randomUUID(), 'complaint')).statusCode).toBe(404);
    expect(
      (await send(null, 'POST', `/conversations/${conversationId}/type`, { typeKey: 'complaint' })).statusCode,
    ).toBe(401);
    expect(
      (await send(first.manager, 'POST', `/conversations/${conversationId}/type`, { typeKey: 'complaint' }, false))
        .statusCode,
    ).toBe(403);
    for (const body of [{}, { typeKey: '   ' }, { typeKey: 'complaint', extra: true }, { typeKey: 'x'.repeat(61) }]) {
      expect(
        (await send(first.manager, 'POST', `/conversations/${conversationId}/type`, body)).statusCode,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(
      (await send(first.manager, 'POST', '/conversations/not-a-uuid/type', { typeKey: 'complaint' })).statusCode,
    ).toBe(400);
    await setRole(first.manager, 'staff_own');
    expect((await correct(first.manager, conversationId, 'complaint')).statusCode).toBe(403);
    // Staff (not the "own leads only" role) may correct
    await setRole(first.manager, 'staff');
    expect((await correct(first.manager, conversationId, 'complaint')).statusCode).toBe(200);
    expect((await conversationRow(conversationId)).type_key).toBe('complaint');
  });

  it('keeps the corrections written once: never edited or deleted, and never "from" and "to" the same type', async () => {
    const { accountId, manager } = await newBusiness();
    const { conversationId } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('new_enquiry'),
    );
    await correct(manager, conversationId, 'complaint');
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction
          .updateTable('classification_corrections')
          .set({ to_type_key: 'spam' })
          .where('conversation_id', '=', conversationId)
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.deleteFrom('classification_corrections').where('conversation_id', '=', conversationId).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      database.system
        .insertInto('classification_corrections')
        .values({
          id: randomUUID(),
          account_id: accountId,
          conversation_id: conversationId,
          from_type_key: 'spam',
          to_type_key: 'spam',
          by_user_id: manager.profile.user.id,
        })
        .execute(),
    ).rejects.toThrow(/classification_corrections_check|check constraint/);
  });
});

describe('removing a type', () => {
  it('moves the conversations sorted as that type to "unclear" and asks a person to look, keeping what they made', async () => {
    const { accountId, manager } = await newBusiness();
    const created = (
      await send(manager, 'POST', '/conversation-types', {
        label: 'Wedding enquiry',
        description: 'Wants a wedding.',
        outcome: 'lead',
      })
    ).json();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor(created.key),
    );
    expect(result.typeKey).toBe(created.key);
    const removed = await send(manager, 'DELETE', `/conversation-types/${created.id}`);
    expect(removed.statusCode, removed.body).toBe(204);
    const row = await conversationRow(conversationId);
    expect(row).toMatchObject({ type_key: 'unclear', needs_person: true });
    // What it made is kept
    expect((await leadRow(result.outcomes[0]!.leadId!)).closed_at).toBeNull();
    const detail = (await send(manager, 'GET', `/conversations/${conversationId}`)).json();
    expect(detail.type.key).toBe('unclear');
  });
});
