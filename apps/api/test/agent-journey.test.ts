import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createConversationFinaliser } from '../src/modules/core/conversations';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// The whole of F19 in one story, the way the owner will try it: Nair Stays is set up, a pretend customer asks about prices, asks
// something the business never answered, gives a phone number, and a pretend complainer writes. Then the team reads the chats back,
// summarises one, answers the question the agent could not, and the next customer gets that answer. Nothing here becomes a lead or a ticket.

let database: Database;
let app: FastifyInstance;
let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) =>
  script(tried, request, messagesSoFar),
);

beforeAll(async () => {
  database = openTestDatabase();
  const config = {
    ...testConfig(),
    ai: { platformKeys: { gemini: [`agent-journey-${randomUUID()}`], openai: [], anthropic: [] } },
  };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

let manager: SignedInPerson;

const send = (person: SignedInPerson, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Sends a request that must work, and answers its body. */
async function ok(person: SignedInPerson, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  const response = await send(person, method, url, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBeLessThan(300);
  return response.json();
}

/** One step per round: tool requests, then the words. */
const rounds =
  (...steps: Array<string | { toolCalls: { name: string; input: unknown }[] }>): LlmScript =>
  (_tried, request, messagesSoFar = []) => {
    if (request.tag.task === 'summarise') {
      return { answer: 'Ravi asked about a deluxe room and an EV charger, and was promised a call within 15 minutes.' };
    }
    const roundNumber = messagesSoFar.filter((message) => message.kind === 'tool_request').length;
    return { answer: steps[Math.min(roundNumber, steps.length - 1)] };
  };

const chat = (conversationId: string | undefined, message: string) =>
  ok(manager, 'POST', '/agent/test-chat', { ...(conversationId ? { conversationId } : {}), message });

let priceChatId = '';
let complaintChatId = '';
let unansweredId = '';

describe('Chapter 1: Nair Stays tells the agent about itself', () => {
  it('sets up the AI, the hours, one offering and one FAQ', async () => {
    manager = await createSignedInPerson(app, database);
    await database.system
      .insertInto('ai_settings')
      .values({
        account_id: manager.profile.business.id,
        key_mode: 'platform',
        platform_enabled: true,
        platform_expires_at: null,
        task_models: {},
      })
      .execute();
    await ok(manager, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
    await ok(manager, 'POST', '/offerings', {
      name: 'Deluxe room',
      fromPricePaise: 400000,
      priceUnit: 'a night',
      gstMode: 'plus',
    });
    await ok(manager, 'POST', '/knowledge/faqs', {
      question: 'Do you have parking?',
      answer: 'Yes, free parking for guests.',
    });
  });
});

describe('Chapter 2: a pretend customer asks about prices, then about something the business never answered', () => {
  it('answers the price from the offerings, naming where it came from', async () => {
    script = rounds(
      { toolCalls: [{ name: 'list_offerings', input: {} }] },
      'A deluxe room is from ₹4,000 a night plus GST.',
    );
    const turn = await chat(undefined, 'How much is a deluxe room?');
    priceChatId = turn.conversationId;
    expect(turn.answeredFrom).toEqual([{ kind: 'offerings', label: 'Offerings and offers' }]);
    expect(turn.promise).toBeNull();
  });

  it('refuses to give a total, whatever the AI says first', async () => {
    let attempt = 0;
    script = (_tried, request, messagesSoFar) => {
      if (messagesSoFar === undefined || request.tag.task === 'summarise') {
        // The second try (no tools): the corrected answer
        return { answer: 'A deluxe room is from ₹4,000 a night plus GST. Our team will confirm the total.' };
      }
      attempt += 1;
      return { answer: 'For 3 nights the total is ₹12,000.' };
    };
    const turn = await chat(priceChatId, 'What is the total for 3 nights?');
    expect(attempt).toBe(1);
    expect(turn.reply).not.toContain('12,000');
    expect(turn.heldBackAmounts).toEqual([12000]);
  });

  it('looks for an answer it does not have, finds none, and writes the question down for the team', async () => {
    script = rounds(
      { toolCalls: [{ name: 'search_knowledge', input: { question: 'Is there an EV charger?' } }] },
      { toolCalls: [{ name: 'log_unanswered_question', input: { question: 'Is there an EV charger?' } }] },
      'I am not sure about that. The team will get back to you.',
    );
    const turn = await chat(priceChatId, 'Is there an EV charger?');
    expect(turn.toolsCalled.map((tool: { name: string }) => tool.name)).toEqual([
      'search_knowledge',
      'log_unanswered_question',
    ]);
    const unanswered = await ok(manager, 'GET', '/knowledge/unanswered');
    expect(unanswered.items.map((item: { question: string }) => item.question)).toEqual(['Is there an EV charger?']);
    unansweredId = unanswered.items[0].id;
  });

  it('answers a question from the FAQs, naming the FAQ', async () => {
    script = rounds(
      { toolCalls: [{ name: 'search_knowledge', input: { question: 'parking' } }] },
      'Yes, parking is free for guests.',
    );
    const turn = await chat(priceChatId, 'Is there parking?');
    expect(turn.answeredFrom).toEqual([{ kind: 'faq', label: 'Do you have parking?' }]);
  });

  it('asks for the phone number, then makes the one promise and keeps it', async () => {
    script = rounds(
      { toolCalls: [{ name: 'save_details', input: { name: 'Ravi' } }] },
      'Thank you, Ravi. What is your phone number?',
    );
    const noPhone = await chat(priceChatId, 'I am Ravi');
    expect(noPhone.promise).toBeNull();

    script = rounds(
      { toolCalls: [{ name: 'save_details', input: { phone: '98470 12345', dates: '5 to 7 December' } }] },
      'Thank you. Our team will call you within 15 minutes.',
    );
    const withPhone = await chat(priceChatId, 'My number is 98470 12345, for 5 to 7 December');
    expect(withPhone.promise).toMatchObject({
      kind: 'call_back_open',
      sentence: 'Our team will call you within 15 minutes.',
    });
    expect(withPhone.detailsSaved).toEqual({ Name: 'Ravi', Phone: '98470 12345', Dates: '5 to 7 December' });

    script = rounds('Is there anything else I can help with?');
    const after = await chat(priceChatId, 'No, thanks');
    expect(after.promise).toEqual(withPhone.promise);
  });
});

describe('Chapter 3: a pretend complainer', () => {
  it('is passed to the manager, never given a sales callback', async () => {
    script = rounds(
      { toolCalls: [{ name: 'save_details', input: { phone: '98470 54321' } }] },
      { toolCalls: [{ name: 'request_human_callback', input: { reason: 'Complaint about a dirty room' } }] },
      "I am sorry about that. I've passed this to the manager, who will get back to you.",
    );
    const turn = await chat(undefined, 'My room was dirty! Call me on 98470 54321');
    complaintChatId = turn.conversationId;
    expect(turn.situation).toBe('not_a_sale');
    expect(turn.promise).toMatchObject({ kind: 'passed_to_manager' });
  });
});

describe('Chapter 4: the team reads the chats back', () => {
  it('shows the whole price chat to the team, with the one promise', async () => {
    const detail = await ok(manager, 'GET', `/agent/test-chats/${priceChatId}`);
    expect(detail.messages.filter((message: { sender: string }) => message.sender === 'customer')).toHaveLength(7);
    expect(detail.promise.kind).toBe('call_back_open');
    expect(detail.summary).toBeNull();
  });

  it('summarises it, and the summary is saved with the chat', async () => {
    const written = await ok(manager, 'POST', `/agent/test-chats/${priceChatId}/summary`);
    expect(written.writtenByAi).toBe(true);
    const detail = await ok(manager, 'GET', `/agent/test-chats/${priceChatId}`);
    expect(detail.summary).toBe(written.summary);
  });
});

describe('Chapter 5: the team answers the question, and the next customer gets the answer', () => {
  it('turns the unanswered question into an FAQ', async () => {
    await ok(manager, 'POST', `/knowledge/unanswered/${unansweredId}/answer`, {
      answer: 'Yes, two EV chargers in the basement.',
    });
  });

  it('finds that FAQ in the next chat', async () => {
    script = rounds(
      { toolCalls: [{ name: 'search_knowledge', input: { question: 'EV charger' } }] },
      'Yes, there are two EV chargers in the basement.',
    );
    const turn = await chat(undefined, 'Do you have an EV charger?');
    expect(turn.answeredFrom).toEqual([{ kind: 'faq', label: 'Is there an EV charger?' }]);
    expect(turn.toolsCalled).toHaveLength(1);
  });
});

describe('Chapter 6: nothing was sorted, and the AI use is on the record', () => {
  it('made no contact, lead or ticket, and sorting a test chat does nothing', async () => {
    const accountId = manager.profile.business.id;
    const countOf = async (table: 'contacts' | 'leads' | 'tickets') =>
      Number(
        (
          await database.system
            .selectFrom(table)
            .select((expression) => expression.fn.countAll<string>().as('total'))
            .where('account_id', '=', accountId)
            .executeTakeFirstOrThrow()
        ).total,
      );
    expect([await countOf('contacts'), await countOf('leads'), await countOf('tickets')]).toEqual([0, 0, 0]);
    const finaliser = createConversationFinaliser({
      database,
      classifier: { classifyConversation: async () => Promise.reject(new Error('not for a test chat')) } as never,
    });
    expect((await finaliser.finaliseConversation(accountId, complaintChatId)).result).toBe('test_chat');
    expect([await countOf('contacts'), await countOf('leads'), await countOf('tickets')]).toEqual([0, 0, 0]);
  });

  it('shows the agent’s calls in the AI usage, by job and by agent (a turn with several rounds is one call)', async () => {
    const byTask = await ok(manager, 'GET', '/ai/usage?groupBy=task');
    const keys = byTask.groups.map((group: { key: string }) => group.key);
    expect(keys).toEqual(expect.arrayContaining(['chat_reply', 'summarise']));
    expect(byTask.groups.find((group: { key: string }) => group.key === 'summarise').calls).toBe(1);
    expect(byTask.totals.failures).toBe(0);
    const byAgent = await ok(manager, 'GET', '/ai/usage?groupBy=agent');
    expect(byAgent.groups.map((group: { key: string }) => group.key)).toEqual(
      expect.arrayContaining(['text-agent', 'summariser']),
    );
  });

  it('keeps every chat out of another business', async () => {
    const stranger = await createSignedInPerson(app, database);
    expect((await send(stranger, 'GET', `/agent/test-chats/${priceChatId}`)).statusCode).toBe(404);
    expect((await send(stranger, 'POST', `/agent/test-chats/${priceChatId}/summary`)).statusCode).toBe(404);
    expect(
      (await send(stranger, 'POST', '/agent/test-chat', { conversationId: priceChatId, message: 'Hi' })).statusCode,
    ).toBe(404);
  });
});
