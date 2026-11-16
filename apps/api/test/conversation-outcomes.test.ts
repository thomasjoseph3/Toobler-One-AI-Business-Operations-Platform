import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
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
import { buildTestApp, testConfig } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

/** What the pretend AI company answers next, and how many times it was asked. */
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
    ai: { platformKeys: { gemini: [`outcomes-${randomUUID()}`], openai: [], anthropic: [] } },
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

/** A new business that may use the platform's AI keys, as a plain "general business". */
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

/** A phone number nobody else in this run uses, as digits. */
const uniqueDigits = () => `9198${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** A conversation from a person, with the customer's words, sorted by the pretend AI's next answer. */
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

const contactsOf = (accountId: string) =>
  database.system
    .selectFrom('contacts')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .execute();
const leadsOf = (accountId: string) =>
  database.system.selectFrom('leads').selectAll().where('account_id', '=', accountId).execute();
const ticketsOf = (accountId: string) =>
  database.system.selectFrom('tickets').selectAll().where('account_id', '=', accountId).execute();
const conversationRow = (conversationId: string) =>
  database.system.selectFrom('conversations').selectAll().where('id', '=', conversationId).executeTakeFirstOrThrow();
const outcomeRows = (conversationId: string) =>
  database.system
    .selectFrom('conversation_outcomes')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .execute();
const eventsNamed = (accountId: string, name: string) =>
  database.system
    .selectFrom('domain_events')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('name', '=', name)
    .execute();
const stageNamed = async (accountId: string, name: string) =>
  (
    await database.system
      .selectFrom('pipeline_stages')
      .select('id')
      .where('account_id', '=', accountId)
      .where('name', '=', name)
      .executeTakeFirstOrThrow()
  ).id;

describe('an enquiry becomes a contact and a lead', () => {
  it('makes the contact from the phone, makes the lead in the first stage on the channel it came in on, owned by the sharing rule, and links them', async () => {
    const { accountId, manager } = await newBusiness();
    const phoneKey = uniqueDigits();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: phoneKey },
      answerFor('new_enquiry'),
      {
        channel: 'whatsapp',
      },
    );

    const contacts = await contactsOf(accountId);
    // The business's own person (the sign-up) is not a contact; the one new contact is the customer
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ phone: `+${phoneKey}`, name: null, lifecycle_stage: 'lead' });

    const leads = await leadsOf(accountId);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      contact_id: contacts[0]!.id,
      first_channel: 'whatsapp',
      owner_user_id: manager.profile.user.id,
      closed_at: null,
    });
    expect(leads[0]!.stage_id).toBe(await stageNamed(accountId, 'New'));
    expect(leads[0]!.created_by).toMatchObject({ kind: 'agent', id: 'classifier' });

    expect(await conversationRow(conversationId)).toMatchObject({ contact_id: contacts[0]!.id });
    const outcome = (await outcomeRows(conversationId))[0]!;
    expect(outcome).toMatchObject({ kind: 'lead', lead_id: leads[0]!.id });
    expect(outcome.applied_at).not.toBeNull();
    expect(result.outcomes[0]).toMatchObject({ kind: 'lead', leadId: leads[0]!.id, ticketId: null, carriedOut: true });
    expect(await eventsNamed(accountId, 'lead.created')).toHaveLength(1);
    expect(await eventsNamed(accountId, 'contact.created')).toHaveLength(1);
  });

  it('writes the web chat channel as web_chat on the lead', async () => {
    const { accountId } = await newBusiness();
    await sortedConversation(accountId, { fromEmail: 'priya@example.com' }, answerFor('new_enquiry'), {
      channel: 'webchat',
    });
    expect((await leadsOf(accountId))[0]).toMatchObject({ first_channel: 'web_chat' });
  });

  it('reuses a contact that is already on file, found by phone or by email, and does not make a second', async () => {
    const { accountId, manager } = await newBusiness();
    const phoneKey = uniqueDigits();
    const added = await app.inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: { origin: 'http://localhost:3000', 'x-requested-with': 'toobler-web', cookie: manager.cookieHeader },
      payload: { name: 'Priya Menon', phone: `+${phoneKey}`, email: 'priya.menon@example.com' },
    });
    expect(added.statusCode, added.body).toBe(201);
    const contactId = added.json().id;

    const byPhone = await sortedConversation(accountId, { fromPhoneKey: phoneKey }, answerFor('vendor_or_partner'));
    expect(await conversationRow(byPhone.conversationId)).toMatchObject({ contact_id: contactId });
    const byEmail = await sortedConversation(
      accountId,
      { fromEmail: 'priya.menon@example.com' },
      answerFor('vendor_or_partner'),
      { channel: 'email' },
    );
    expect(await conversationRow(byEmail.conversationId)).toMatchObject({ contact_id: contactId });
    expect(await contactsOf(accountId)).toHaveLength(1);
  });

  it('gives a second enquiry from the same person to the lead they already have, and makes no second lead or contact', async () => {
    const { accountId } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    const second = await sortedConversation(accountId, who, answerFor('general_question'));
    const leads = await leadsOf(accountId);
    expect(leads).toHaveLength(1);
    expect(await contactsOf(accountId)).toHaveLength(1);
    expect(second.result.outcomes[0]).toMatchObject({ kind: 'lead', leadId: first.result.outcomes[0]!.leadId });
    expect(await eventsNamed(accountId, 'lead.created')).toHaveLength(1);
  });

  it('reopens a lead lost less than 60 days ago at the first stage (the owner stays), and tells the world with lead.reopened', async () => {
    const { accountId } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    const leadId = first.result.outcomes[0]!.leadId!;
    const before = (await leadsOf(accountId))[0]!;
    await database.system
      .updateTable('leads')
      .set({
        stage_id: await stageNamed(accountId, 'Lost'),
        closed_at: new Date(Date.now() - 10 * 86_400_000),
        lost_reason: 'Too costly',
      })
      .where('id', '=', leadId)
      .execute();

    const second = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    const leads = await leadsOf(accountId);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      id: leadId,
      closed_at: null,
      lost_reason: null,
      owner_user_id: before.owner_user_id,
    });
    expect(leads[0]!.stage_id).toBe(await stageNamed(accountId, 'New'));
    expect(second.result.outcomes[0]!.leadId).toBe(leadId);
    expect(await eventsNamed(accountId, 'lead.reopened')).toHaveLength(1);
  });

  it('starts a new lead when the last one was lost 60 days ago or more, and when the last one was won', async () => {
    const { accountId } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    await database.system
      .updateTable('leads')
      .set({
        stage_id: await stageNamed(accountId, 'Lost'),
        closed_at: new Date(Date.now() - 61 * 86_400_000),
        lost_reason: 'Too costly',
      })
      .where('id', '=', first.result.outcomes[0]!.leadId!)
      .execute();
    const second = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    expect(second.result.outcomes[0]!.leadId).not.toBe(first.result.outcomes[0]!.leadId);

    await database.system
      .updateTable('leads')
      .set({ stage_id: await stageNamed(accountId, 'Won'), closed_at: new Date(Date.now() - 3 * 86_400_000) })
      .where('id', '=', second.result.outcomes[0]!.leadId!)
      .execute();
    const third = await sortedConversation(accountId, who, answerFor('new_enquiry'));
    expect(third.result.outcomes[0]!.leadId).not.toBe(second.result.outcomes[0]!.leadId);
    expect(await leadsOf(accountId)).toHaveLength(3);
  });

  it('makes one lead and one contact when two conversations from a new person are sorted at the same moment', async () => {
    const { accountId } = await newBusiness();
    const who = { fromPhoneKey: uniqueDigits() };
    const first = await records().startConversation(accountId, { channel: 'whatsapp', ...who });
    const second = await records().startConversation(accountId, { channel: 'phone', ...who });
    await records().addMessage(accountId, first, { sender: 'customer', body: 'A room please' });
    await records().addMessage(accountId, second, { sender: 'customer', body: 'Same person calling again' });
    nextAnswer = answerFor('new_enquiry');
    const [firstResult, secondResult] = await Promise.all([
      finaliser().finaliseConversation(accountId, first),
      finaliser().finaliseConversation(accountId, second),
    ]);
    expect(await leadsOf(accountId)).toHaveLength(1);
    expect(await contactsOf(accountId)).toHaveLength(1);
    expect(firstResult.outcomes[0]!.leadId).toBe(secondResult.outcomes[0]!.leadId);
  });
});

describe('a request becomes a ticket', () => {
  it('makes an unassigned complaint ticket of high priority with the type as its title and the AI reason as its details, and no lead and no lifecycle change', async () => {
    const { accountId } = await newBusiness();
    const secret = `secret-${randomUUID()}`;
    const { result } = await sortedConversation(
      accountId,
      { fromEmail: 'guest@example.com' },
      answerFor('complaint', 0.92, { needsPerson: true, reason: 'Unhappy about the room.' }),
      { channel: 'email', words: `The AC was broken all night. ${secret}` },
    );
    const tickets = await ticketsOf(accountId);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      title: 'Complaint',
      details: 'Unhappy about the room.',
      type: 'complaint',
      priority: 'high',
      status: 'open',
      owner_user_id: null,
      conversation_type_key: 'complaint',
    });
    expect(tickets[0]!.created_by).toMatchObject({ kind: 'agent', id: 'classifier' });
    expect(result.outcomes[0]).toMatchObject({
      kind: 'ticket',
      ticketId: tickets[0]!.id,
      leadId: null,
      carriedOut: true,
    });
    expect(await leadsOf(accountId)).toHaveLength(0);
    // A complaint does not turn a person into a "Lead"
    expect((await contactsOf(accountId))[0]).toMatchObject({ lifecycle_stage: 'new' });
    // What the customer wrote is never copied into the ticket, the log or an event
    expect(JSON.stringify(tickets)).not.toContain(secret);
    const log = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', accountId)
      .execute();
    expect(JSON.stringify(log)).not.toContain(secret);
    expect(await eventsNamed(accountId, 'ticket.created')).toHaveLength(1);
  });

  it('makes a ticket and a lead for a complaint that also asks a price', async () => {
    const { accountId } = await newBusiness();
    const { result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('complaint', 0.92, { secondary: [{ type: 'new_enquiry', confidence: 0.81 }] }),
    );
    expect(result.outcomes.map((outcome) => outcome.kind)).toEqual(['ticket', 'lead']);
    expect(await ticketsOf(accountId)).toHaveLength(1);
    expect(await leadsOf(accountId)).toHaveLength(1);
    expect(await contactsOf(accountId)).toHaveLength(1);
  });

  it("adds a note to the person's open ticket of the same kind instead of making another, and makes a new one for another kind", async () => {
    const { accountId } = await newBusiness();
    const who = { fromEmail: 'guest@example.com' };
    const first = await sortedConversation(accountId, who, answerFor('complaint'), { channel: 'email' });
    const second = await sortedConversation(accountId, who, answerFor('complaint'), { channel: 'webchat' });
    const tickets = await ticketsOf(accountId);
    expect(tickets).toHaveLength(1);
    expect(second.result.outcomes[0]!.ticketId).toBe(first.result.outcomes[0]!.ticketId);
    const notes = await database.system
      .selectFrom('ticket_notes')
      .selectAll()
      .where('ticket_id', '=', tickets[0]!.id)
      .execute();
    expect(notes.map((note) => note.body)).toEqual(['Another conversation (web chat) was sorted as Complaint.']);

    const callback = await sortedConversation(accountId, who, answerFor('callback_request'), { channel: 'email' });
    expect(await ticketsOf(accountId)).toHaveLength(2);
    expect(callback.result.outcomes[0]!.ticketId).not.toBe(first.result.outcomes[0]!.ticketId);
  });

  it('does not join a ticket that was closed', async () => {
    const { accountId } = await newBusiness();
    const who = { fromEmail: 'guest@example.com' };
    const first = await sortedConversation(accountId, who, answerFor('complaint'), { channel: 'email' });
    await database.system
      .updateTable('tickets')
      .set({ status: 'done', closed_at: new Date() })
      .where('id', '=', first.result.outcomes[0]!.ticketId!)
      .execute();
    const second = await sortedConversation(accountId, who, answerFor('complaint'), { channel: 'email' });
    expect(second.result.outcomes[0]!.ticketId).not.toBe(first.result.outcomes[0]!.ticketId);
    expect(await ticketsOf(accountId)).toHaveLength(2);
  });
});

describe('what makes no lead and no ticket', () => {
  it('keeps no contact for spam, and nothing is made', async () => {
    const { accountId } = await newBusiness();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('spam'),
    );
    expect(await contactsOf(accountId)).toHaveLength(0);
    expect(await leadsOf(accountId)).toHaveLength(0);
    expect(await ticketsOf(accountId)).toHaveLength(0);
    expect(result.outcomes[0]).toMatchObject({ kind: 'filter', leadId: null, ticketId: null, carriedOut: true });
    expect(await conversationRow(conversationId)).toMatchObject({ contact_id: null });
  });

  it('keeps the contact for a supplier but makes no lead and no ticket', async () => {
    const { accountId } = await newBusiness();
    const { conversationId, result } = await sortedConversation(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      answerFor('vendor_or_partner'),
    );
    expect(await contactsOf(accountId)).toHaveLength(1);
    expect(await leadsOf(accountId)).toHaveLength(0);
    expect(await ticketsOf(accountId)).toHaveLength(0);
    expect(result.outcomes[0]).toMatchObject({ kind: 'log', carriedOut: true });
    expect((await conversationRow(conversationId)).contact_id).not.toBeNull();
  });

  it("makes no contact when nothing was said or the person is the business's own team (rules)", async () => {
    const { accountId } = await newBusiness();
    const conversationId = await records().startConversation(accountId, {
      channel: 'phone',
      fromPhoneKey: uniqueDigits(),
    });
    await finaliser().finaliseConversation(accountId, conversationId, { callDurationSeconds: 3, callerSpoke: false });
    expect(await contactsOf(accountId)).toHaveLength(0);
  });
});

describe('when nobody can be identified', () => {
  it('leaves the lead waiting, marks the conversation "needs a person", and makes nothing up', async () => {
    const { accountId } = await newBusiness();
    const { conversationId, result } = await sortedConversation(accountId, {}, answerFor('new_enquiry'), {
      channel: 'webchat',
    });
    expect(await contactsOf(accountId)).toHaveLength(0);
    expect(await leadsOf(accountId)).toHaveLength(0);
    expect(result.outcomes[0]).toMatchObject({ kind: 'lead', leadId: null, carriedOut: false });
    expect(result.needsPerson).toBe(true);
    expect(await conversationRow(conversationId)).toMatchObject({ needs_person: true, contact_id: null });
    // Running it again changes nothing and asks the AI nothing
    const before = pretendAiCompany.requests.length;
    await finaliser().finaliseConversation(accountId, conversationId);
    expect(pretendAiCompany.requests.length).toBe(before);
    expect(await leadsOf(accountId)).toHaveLength(0);
  });
});

describe('safe to retry', () => {
  /** A conversation that was sorted but whose outcome was never carried out (as after a failure), made straight in the database. */
  async function sortedButNotCarriedOut(
    accountId: string,
    who: { fromPhoneKey?: string },
    typeKey: string,
    kind: 'lead' | 'ticket',
  ) {
    const conversationId = await records().startConversation(accountId, { channel: 'whatsapp', ...who });
    await records().addMessage(accountId, conversationId, { sender: 'customer', body: 'Hello' });
    await database.system
      .updateTable('conversations')
      .set({
        status: 'sorted',
        type_key: typeKey,
        type_source: 'ai_final',
        type_confidence: 0.9,
        sorted_at: new Date(),
        ended_at: new Date(),
      })
      .where('id', '=', conversationId)
      .execute();
    await database.system
      .insertInto('conversation_outcomes')
      .values({
        id: randomUUID(),
        account_id: accountId,
        conversation_id: conversationId,
        type_key: typeKey,
        kind,
        confidence: 0.9,
      })
      .execute();
    return conversationId;
  }

  it('carries out what was left undone without asking the AI again', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await sortedButNotCarriedOut(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      'new_enquiry',
      'lead',
    );
    const before = pretendAiCompany.requests.length;
    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(pretendAiCompany.requests.length).toBe(before);
    expect(result).toMatchObject({ result: 'already_sorted' });
    expect(result.outcomes[0]).toMatchObject({ kind: 'lead', carriedOut: true });
    expect(await leadsOf(accountId)).toHaveLength(1);
    // And running it once more makes nothing more
    await finaliser().finaliseConversation(accountId, conversationId);
    expect(await leadsOf(accountId)).toHaveLength(1);
    expect(await contactsOf(accountId)).toHaveLength(1);
  });

  it('asks a person to look when the ticket type was removed after the conversation was sorted, and makes no ticket', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await sortedButNotCarriedOut(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      'a_removed_type',
      'ticket',
    );
    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(await ticketsOf(accountId)).toHaveLength(0);
    expect(result.needsPerson).toBe(true);
    expect(result.outcomes[0]).toMatchObject({ kind: 'ticket', ticketId: null, carriedOut: true });
  });

  it('rolls everything back when carrying out fails (no contact, no lead, the outcome still waiting), and the retry then works without asking the AI', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await sortedButNotCarriedOut(
      accountId,
      { fromPhoneKey: uniqueDigits() },
      'new_enquiry',
      'lead',
    );
    // For a moment, making a lead for this business fails in the database (a temporary trigger, removed in the end)
    const name = `fail_${randomUUID().replace(/-/g, '')}`;
    await sql`create function app.${sql.id(name)}() returns trigger language plpgsql as $$ begin raise exception 'pretend failure'; end $$`.execute(
      database.system,
    );
    await sql`create trigger ${sql.id(name)} before insert on app.leads for each row when (new.account_id = ${sql.lit(accountId)}::uuid) execute function app.${sql.id(name)}()`.execute(
      database.system,
    );
    try {
      await expect(finaliser().finaliseConversation(accountId, conversationId)).rejects.toThrow(/pretend failure/);
      // The contact made in the same transaction was rolled back with it
      expect(await contactsOf(accountId)).toHaveLength(0);
      expect(await leadsOf(accountId)).toHaveLength(0);
      expect((await outcomeRows(conversationId))[0]!.applied_at).toBeNull();
      expect(await conversationRow(conversationId)).toMatchObject({ contact_id: null });
    } finally {
      await sql`drop trigger ${sql.id(name)} on app.leads`.execute(database.system);
      await sql`drop function app.${sql.id(name)}()`.execute(database.system);
    }
    const before = pretendAiCompany.requests.length;
    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(pretendAiCompany.requests.length).toBe(before);
    expect(result.outcomes[0]).toMatchObject({ kind: 'lead', carriedOut: true });
    expect(await leadsOf(accountId)).toHaveLength(1);
    expect(await contactsOf(accountId)).toHaveLength(1);
  });
});
