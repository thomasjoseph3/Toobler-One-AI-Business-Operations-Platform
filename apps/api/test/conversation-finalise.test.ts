import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JobRun } from '../src/kernel/jobs/jobs';
import type { Database } from '../src/kernel/database';
import { createAiService } from '../src/modules/core/ai';
import {
  createConversationClassifier,
  createConversationFinaliser,
  createConversationRecordsService,
} from '../src/modules/core/conversations';
import conversationsModule from '../src/modules/core/conversations/module';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

/** What the pretend AI company does next: an answer that fits the classifier's shape, or an error to throw. */
let nextAnswer: unknown;
let nextError: Error | null = null;
const pretendAiCompany = createScriptedLlmProvider(() => {
  if (nextError) throw nextError;
  return { answer: nextAnswer };
});

const answerFor = (primary: string, confidence = 0.9, extra: Record<string, unknown> = {}) => ({
  primary: { type: primary, confidence },
  secondary: [],
  needsPerson: false,
  reason: 'Because of what was asked.',
  ...extra,
});

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`finalise-${randomUUID()}`], openai: [], anthropic: [] } },
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

/** A new business that may use the platform's AI keys, as a plain "general business" (13 types). Returns its id and its manager. */
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

/** A conversation with the customer's words, started and filled the way a channel would. */
async function conversationWith(
  accountId: string,
  customerWords: string[],
  options: { channel?: 'webchat' | 'whatsapp' | 'email' | 'phone'; fromPhoneKey?: string; fromEmail?: string } = {},
): Promise<string> {
  const conversationId = await records().startConversation(accountId, {
    channel: options.channel ?? 'webchat',
    fromPhoneKey: options.fromPhoneKey,
    fromEmail: options.fromEmail,
  });
  for (const words of customerWords)
    await records().addMessage(accountId, conversationId, { sender: 'customer', body: words });
  return conversationId;
}

const conversationRow = (conversationId: string) =>
  database.system.selectFrom('conversations').selectAll().where('id', '=', conversationId).executeTakeFirstOrThrow();
const outcomeRows = (conversationId: string) =>
  database.system
    .selectFrom('conversation_outcomes')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .execute();
/** A phone number nobody else in this run uses, as digits. */
const uniqueDigits = () => `9198${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

describe('sorting a conversation with the AI', () => {
  it('stores the type, who decided, how sure, the reason, and one outcome per type, and records nothing of the words', async () => {
    const { accountId } = await newBusiness();
    const secret = `secret-${randomUUID()}`;
    const conversationId = await conversationWith(accountId, [`The AC is broken. What does March cost? ${secret}`]);
    nextAnswer = answerFor('complaint', 0.92, {
      secondary: [{ type: 'new_enquiry', confidence: 0.81 }],
      needsPerson: true,
      reason: 'Unhappy about the AC and asked a price.',
    });
    nextError = null;

    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(result).toMatchObject({
      conversationId,
      result: 'sorted',
      typeKey: 'complaint',
      typeSource: 'ai_final',
      needsPerson: true,
      aiUnsure: false,
    });
    expect(result.outcomes.map((outcome) => [outcome.typeKey, outcome.kind])).toEqual([
      ['complaint', 'ticket'],
      ['new_enquiry', 'lead'],
    ]);

    const row = await conversationRow(conversationId);
    expect(row).toMatchObject({
      status: 'sorted',
      type_key: 'complaint',
      type_source: 'ai_final',
      type_reason: 'Unhappy about the AC and asked a price.',
      needs_person: true,
      ai_unsure: false,
    });
    expect(Number(row.type_confidence)).toBeCloseTo(0.92);
    expect(row.sorted_at).not.toBeNull();
    expect(row.ended_at).not.toBeNull();
    // This web visitor gave no phone and no email, so nobody can be identified: the ticket and the lead wait, and a person must look
    // (the tests of carrying outcomes out, with a phone or an email, are in conversation-outcomes.test.ts)
    const outcomes = await outcomeRows(conversationId);
    expect(outcomes).toHaveLength(2);
    expect(
      outcomes.every(
        (outcome) => outcome.lead_id === null && outcome.ticket_id === null && outcome.applied_at === null,
      ),
    ).toBe(true);

    // The call is recorded against this conversation, with no words; the log line and the event hold no words either
    const calls = await database.system
      .selectFrom('ai_calls')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .execute();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ task: 'classify_conversation', agent_id: 'classifier', channel: 'webchat' });
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('kind', '=', 'conversations.sorted')
      .execute();
    expect(logLines).toHaveLength(1);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('name', '=', 'conversation.sorted')
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      conversationId,
      typeKey: 'complaint',
      outcomeKinds: ['ticket', 'lead'],
    });
    for (const holder of [calls, logLines, events, row, outcomes]) expect(JSON.stringify(holder)).not.toContain(secret);
  });

  it("sends the AI the whole conversation: the customer's lines and the business's, and not the system lines", async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['Hello, do you have a room?']);
    await records().addMessage(accountId, conversationId, { sender: 'agent', body: 'Yes, for which dates?' });
    await records().addMessage(accountId, conversationId, { sender: 'system', body: 'INTERNAL-NOTE-NOT-FOR-THE-AI' });
    await records().addMessage(accountId, conversationId, { sender: 'customer', body: '20 to 23 December.' });
    nextAnswer = answerFor('new_enquiry');
    const before = pretendAiCompany.requests.length;
    await finaliser().finaliseConversation(accountId, conversationId);
    const request = pretendAiCompany.requests[before]!;
    expect(request.tag.conversationId).toBe(conversationId);
    const text = request.prompt.messages[0]!.text;
    expect(text).toContain(
      'Customer: Hello, do you have a room?\nBusiness: Yes, for which dates?\nCustomer: 20 to 23 December.',
    );
    expect(text).not.toContain('INTERNAL-NOTE-NOT-FOR-THE-AI');
  });

  it('marks a fairly sure answer "AI unsure" and turns a weak one into "unclear" that needs a person', async () => {
    const { accountId } = await newBusiness();
    const unsure = await conversationWith(accountId, ['Maybe a room?']);
    nextAnswer = answerFor('new_enquiry', 0.55);
    expect(await finaliser().finaliseConversation(accountId, unsure)).toMatchObject({
      typeKey: 'new_enquiry',
      aiUnsure: true,
    });
    expect(await conversationRow(unsure)).toMatchObject({ ai_unsure: true });

    const weak = await conversationWith(accountId, ['hmm']);
    nextAnswer = answerFor('new_enquiry', 0.2);
    const result = await finaliser().finaliseConversation(accountId, weak);
    expect(result).toMatchObject({ typeKey: 'unclear', needsPerson: true });
    expect(result.outcomes).toMatchObject([{ typeKey: 'unclear', kind: 'review', aiUnsure: false }]);
  });

  it('gives a business that never opened its types the starting types for its kind of business', async () => {
    const { accountId } = await newBusiness();
    await database.system
      .updateTable('accounts')
      .set({ industry: 'hotel_resort' })
      .where('id', '=', accountId)
      .execute();
    const conversationId = await conversationWith(accountId, ['Please send two towels to room 204']);
    nextAnswer = answerFor('in_house_guest_request');
    const result = await finaliser().finaliseConversation(accountId, conversationId);
    expect(result.typeKey).toBe('in_house_guest_request');
    const types = await database.system
      .selectFrom('conversation_types')
      .select('key')
      .where('account_id', '=', accountId)
      .execute();
    expect(types).toHaveLength(16);
  });
});

describe('sorting without the AI (the rules)', () => {
  /** Finalises and says whether the AI was asked. */
  async function finaliseAndCountAiCalls(accountId: string, conversationId: string, options = {}) {
    nextAnswer = answerFor('new_enquiry');
    const before = pretendAiCompany.requests.length;
    const result = await finaliser().finaliseConversation(accountId, conversationId, options);
    return { result, aiCalls: pretendAiCompany.requests.length - before };
  }

  it('calls a blocked number spam without asking the AI', async () => {
    const { accountId, manager } = await newBusiness();
    const blockedKey = uniqueDigits();
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/block-list',
      headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
      payload: { items: [{ phone: `+${blockedKey}` }] },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const conversationId = await conversationWith(accountId, ['Buy insurance now'], {
      channel: 'phone',
      fromPhoneKey: blockedKey,
    });
    const { result, aiCalls } = await finaliseAndCountAiCalls(accountId, conversationId);
    expect(aiCalls).toBe(0);
    expect(result).toMatchObject({ typeKey: 'spam', typeSource: 'rule' });
    expect(result.outcomes).toMatchObject([{ typeKey: 'spam', kind: 'filter', aiUnsure: false }]);
    expect(await conversationRow(conversationId)).toMatchObject({ type_reason: 'blocked', type_source: 'rule' });
    const log = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', conversationId)
      .execute();
    expect(log[0]!.actor).toMatchObject({ kind: 'system', id: 'pre-filter' });
  });

  it("calls a conversation from the business's own team internal", async () => {
    const { accountId, manager } = await newBusiness();
    const staffRow = await database.system
      .selectFrom('users')
      .select('mobile_key')
      .where('id', '=', manager.profile.user.id)
      .executeTakeFirstOrThrow();
    const conversationId = await conversationWith(accountId, ['Testing the line'], {
      channel: 'whatsapp',
      fromPhoneKey: staffRow.mobile_key!,
    });
    const { result, aiCalls } = await finaliseAndCountAiCalls(accountId, conversationId);
    expect(aiCalls).toBe(0);
    expect(result).toMatchObject({ typeKey: 'internal', typeSource: 'rule' });
  });

  it('calls a short silent call, an empty chat, and a conversation with nothing said no_conversation', async () => {
    const { accountId } = await newBusiness();
    const silentCall = await conversationWith(accountId, ['(silence)'], { channel: 'phone' });
    const silent = await finaliseAndCountAiCalls(accountId, silentCall, { callDurationSeconds: 4, callerSpoke: false });
    expect(silent.aiCalls).toBe(0);
    expect(silent.result.typeKey).toBe('no_conversation');

    const emptyChat = await conversationWith(accountId, []);
    await records().addMessage(accountId, emptyChat, { sender: 'agent', body: 'Hello! How can I help?' });
    const empty = await finaliseAndCountAiCalls(accountId, emptyChat);
    expect(empty.aiCalls).toBe(0);
    expect(empty.result.typeKey).toBe('no_conversation');
    expect(await conversationRow(emptyChat)).toMatchObject({ type_reason: 'empty_chat' });

    const nothingSaid = await conversationWith(accountId, [], { channel: 'phone' });
    const nothing = await finaliseAndCountAiCalls(accountId, nothingSaid);
    expect(nothing.aiCalls).toBe(0);
    expect(await conversationRow(nothingSaid)).toMatchObject({
      type_key: 'no_conversation',
      type_reason: 'nothing_said',
    });
  });

  it('calls a machine-made email automated, and gives a machine email nothing to the AI', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['Your order has shipped'], {
      channel: 'email',
      fromEmail: 'orders@shop.example',
    });
    const { result, aiCalls } = await finaliseAndCountAiCalls(accountId, conversationId, {
      emailHeaders: { 'Auto-Submitted': 'auto-generated' },
    });
    expect(aiCalls).toBe(0);
    expect(result).toMatchObject({ typeKey: 'automated' });
    expect(result.outcomes[0]).toMatchObject({ kind: 'ignore' });
  });
});

describe('safe to run twice', () => {
  it('leaves a sorted conversation alone: the second time is "already sorted", with no new AI call', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['A room please']);
    nextAnswer = answerFor('new_enquiry');
    const first = await finaliser().finaliseConversation(accountId, conversationId);
    const before = pretendAiCompany.requests.length;
    nextAnswer = answerFor('complaint');
    const second = await finaliser().finaliseConversation(accountId, conversationId);
    expect(pretendAiCompany.requests.length).toBe(before);
    expect(second).toMatchObject({ result: 'already_sorted', typeKey: first.typeKey, outcomes: first.outcomes });
    expect(await outcomeRows(conversationId)).toHaveLength(1);
  });

  it('sorts once when two sortings arrive at the same moment', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['A room please']);
    nextAnswer = answerFor('new_enquiry');
    const results = await Promise.all([
      finaliser().finaliseConversation(accountId, conversationId),
      finaliser().finaliseConversation(accountId, conversationId),
    ]);
    expect(results.map((entry) => entry.typeKey)).toEqual(['new_enquiry', 'new_enquiry']);
    expect(await outcomeRows(conversationId)).toHaveLength(1);
    const logLines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', conversationId)
      .execute();
    expect(logLines).toHaveLength(1);
  });

  it('sorts again on request: the new outcomes replace the old, the old are kept as no longer applying, and no type is stored twice', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['Actually this was about a supplier']);
    nextAnswer = answerFor('complaint', 0.9, { secondary: [{ type: 'new_enquiry', confidence: 0.8 }] });
    await finaliser().finaliseConversation(accountId, conversationId);
    nextAnswer = answerFor('new_enquiry', 0.9);
    const again = await finaliser().finaliseConversation(accountId, conversationId, { force: true });
    expect(again).toMatchObject({ result: 'sorted', typeKey: 'new_enquiry' });
    const outcomes = await outcomeRows(conversationId);
    expect(outcomes.map((outcome) => outcome.type_key).sort()).toEqual(['complaint', 'new_enquiry']);
    expect(outcomes.find((outcome) => outcome.type_key === 'complaint')!.superseded_at).not.toBeNull();
    expect(outcomes.find((outcome) => outcome.type_key === 'new_enquiry')!.superseded_at).toBeNull();
  });
});

describe('when the AI cannot answer', () => {
  it('changes nothing and fails, so the job is tried again; the retry then works', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['A room please']);
    nextError = new Error('socket hang up');
    await expect(finaliser().finaliseConversation(accountId, conversationId)).rejects.toMatchObject({ status: 502 });
    expect(await conversationRow(conversationId)).toMatchObject({ status: 'open', type_key: null });
    expect(await outcomeRows(conversationId)).toHaveLength(0);

    nextError = null;
    nextAnswer = answerFor('new_enquiry');
    expect(await finaliser().finaliseConversation(accountId, conversationId)).toMatchObject({ result: 'sorted' });
  });

  it('refuses an answer that names a type the business does not have, and changes nothing', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['A room please']);
    nextError = null;
    nextAnswer = answerFor('made_up_type');
    await expect(finaliser().finaliseConversation(accountId, conversationId)).rejects.toMatchObject({ status: 502 });
    expect(await conversationRow(conversationId)).toMatchObject({ status: 'open' });
  });
});

describe('keeping businesses apart and the record safe', () => {
  it("answers 404 for an unknown conversation and for another business's", async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    const theirs = await conversationWith(first.accountId, ['A room please']);
    await expect(finaliser().finaliseConversation(first.accountId, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    await expect(finaliser().finaliseConversation(second.accountId, theirs)).rejects.toMatchObject({ status: 404 });
    await expect(
      records().addMessage(second.accountId, theirs, { sender: 'customer', body: 'Hello' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await conversationRow(theirs)).toMatchObject({ status: 'open' });
  });

  it('refuses a phone not given as digits, an email not in lower case, and an empty message', async () => {
    const { accountId } = await newBusiness();
    await expect(
      records().startConversation(accountId, { channel: 'phone', fromPhoneKey: '+91 98470' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      records().startConversation(accountId, { channel: 'email', fromEmail: 'Priya@Example.com' }),
    ).rejects.toMatchObject({ status: 400 });
    const conversationId = await conversationWith(accountId, []);
    await expect(
      records().addMessage(accountId, conversationId, { sender: 'customer', body: '   ' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('stores a message once when the channel sends it twice', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, []);
    const input = { sender: 'customer' as const, body: 'Hello', channelMessageId: 'wamid.ABC' };
    expect(await records().addMessage(accountId, conversationId, input)).toBe(true);
    expect(await records().addMessage(accountId, conversationId, input)).toBe(false);
    const messages = await database.system
      .selectFrom('conversation_messages')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .execute();
    expect(messages).toHaveLength(1);
  });

  it('never lets business code edit or delete a message, delete a conversation, or change who it was with', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['Hello']);
    const attempt = (
      work: (transaction: Parameters<Parameters<Database['runInAccountTransaction']>[1]>[0]) => Promise<unknown>,
    ) => database.runInAccountTransaction(accountId, work);
    await expect(
      attempt((transaction) =>
        transaction
          .updateTable('conversation_messages')
          .set({ body: 'Changed' })
          .where('conversation_id', '=', conversationId)
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      attempt((transaction) =>
        transaction.deleteFrom('conversation_messages').where('conversation_id', '=', conversationId).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      attempt((transaction) => transaction.deleteFrom('conversations').where('id', '=', conversationId).execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(
      attempt((transaction) =>
        transaction.updateTable('conversations').set({ channel: 'email' }).where('id', '=', conversationId).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    // Who it was with can be filled in once (a web chat learns the phone during the chat), but never changed or cleared after
    await attempt((transaction) =>
      transaction
        .updateTable('conversations')
        .set({ from_phone_key: '919800000000' })
        .where('id', '=', conversationId)
        .execute(),
    );
    await expect(
      attempt((transaction) =>
        transaction
          .updateTable('conversations')
          .set({ from_phone_key: '919811111111' })
          .where('id', '=', conversationId)
          .execute(),
      ),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      attempt((transaction) =>
        transaction
          .updateTable('conversations')
          .set({ from_phone_key: null })
          .where('id', '=', conversationId)
          .execute(),
      ),
    ).rejects.toThrow(/cannot be changed/);
  });

  it('refuses a conversation that claims to be sorted without a type, or a type without being sorted', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['Hello']);
    await expect(
      database.system.updateTable('conversations').set({ status: 'sorted' }).where('id', '=', conversationId).execute(),
    ).rejects.toThrow(/conversations_sorted_has_type/);
  });
});

describe('the background job', () => {
  /** Runs the module's job the way the job runner would. */
  async function runJob(accountId: string, data: Record<string, unknown>) {
    const definition = conversationsModule.jobs?.find((job) => job.name === 'conversations.sort_conversation');
    if (!definition) throw new Error('the job is missing');
    await definition.run({
      data: { accountId, ...data },
      accountContext: app.kernel.contextFor(accountId, { kind: 'system', id: 'conversations.sort_conversation' }),
      enqueueJob: async () => undefined,
      listAccountIds: async () => [accountId],
      logger: console as never,
      services: { config: app.kernel.config, database, mail: undefined as never, llm: app.kernel.llm },
    } satisfies JobRun);
  }

  it('sorts the conversation it is given, passing on what only the channel knows', async () => {
    const { accountId } = await newBusiness();
    const conversationId = await conversationWith(accountId, ['(silence)'], { channel: 'phone' });
    await runJob(accountId, { conversationId, callDurationSeconds: 3, callerSpoke: false });
    expect(await conversationRow(conversationId)).toMatchObject({
      status: 'sorted',
      type_key: 'no_conversation',
      type_source: 'rule',
    });
  });

  it('fails when it is given no conversation, so a mistake is not silently dropped', async () => {
    const { accountId } = await newBusiness();
    await expect(runJob(accountId, {})).rejects.toThrow(/conversationId/);
  });
});
