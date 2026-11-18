import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createAgentSavedTurnService } from '../src/modules/core/agents/services/agent-saved-turn.service';
import type { AgentTurnResult } from '../src/modules/core/agents/services/agent-runtime.service';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../src/modules/core/agents/helpers/agent-conversation-state';
import { createConversationRecordsService } from '../src/modules/core/conversations';
import { createConversationInboxService } from '../src/modules/core/conversations/services/conversation-inbox.service';
import { buildTestApp } from './support/app';
import { createPretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F21: the inbox (GET /conversations), staff takeover (takeover, handback), the reply and done.

let database: Database;
let app: FastifyInstance;
let records: ReturnType<typeof createConversationRecordsService>;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  records = createConversationRecordsService({ database });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** A web chat of the business with one customer message, as the widget would have made it. */
async function startChat(owner: TeamMember, customerWords = 'Hello, do you have a room?') {
  const conversationId = await records.startConversation(owner.businessId, { channel: 'webchat' });
  await records.addMessage(owner.businessId, conversationId, { sender: 'customer', body: customerWords });
  return conversationId;
}

/** A turn the pretend agent "thought" of, so no AI is needed. */
function pretendTurn(reply: string): AgentTurnResult {
  return {
    reply,
    state: EMPTY_AGENT_CONVERSATION_STATE,
    toolCalls: [],
    heldBackAmounts: [],
    details: null,
    modelFailedAfterActing: false,
  };
}

async function messagesOf(conversationId: string) {
  return database.system
    .selectFrom('conversation_messages')
    .select(['sender', 'body', 'by_user_id'])
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
}

describe('GET /conversations (the inbox)', () => {
  it('lists real conversations with needs-a-person first, then newest activity, and leaves out test chats', async () => {
    const owner = await signUpOwner(app, database);
    const older = await startChat(owner, 'First question');
    const newer = await startChat(owner, 'Second question');
    const urgent = await startChat(owner, 'I want a person');
    await database.system.updateTable('conversations').set({ needs_person: true }).where('id', '=', older).execute();
    await records.startConversation(owner.businessId, { channel: 'webchat', isTest: true });
    const inbox = await owner.ok('GET', '/conversations');
    expect(inbox.items.map((item: { id: string }) => item.id)).toEqual([older, urgent, newer]);
    expect(inbox).toMatchObject({ total: 3, page: 1, limit: 25 });
    expect(inbox.items[0]).toMatchObject({
      channel: 'webchat',
      needsPerson: true,
      preview: 'First question',
      heldBy: null,
      doneAt: null,
      contact: null,
    });
  });

  it('filters by channel, open or done, who holds it and needs a person, and pages', async () => {
    const owner = await signUpOwner(app, database);
    const first = await startChat(owner);
    const second = await startChat(owner);
    await owner.ok('POST', `/conversations/${first}/takeover`);
    await owner.ok('POST', `/conversations/${second}/done`);
    const ids = async (query: string) =>
      (await owner.ok('GET', `/conversations?${query}`)).items.map((item: { id: string }) => item.id);
    expect(await ids('held=me')).toEqual([first]);
    expect(await ids('held=any')).toEqual([first]);
    expect(await ids('status=done')).toEqual([second]);
    expect(await ids('status=open')).toEqual([first]);
    expect(await ids('channel=whatsapp')).toEqual([]);
    expect(await ids('needs_person=true')).toEqual([]);
    expect((await owner.ok('GET', '/conversations?limit=1&page=2')).items).toHaveLength(1);
    await owner.refused('GET', '/conversations?channel=fax', undefined, 400);
    await owner.refused('GET', '/conversations?limit=1000', undefined, 400);
  });

  it('is for managers and staff only, and shows another business nothing', async () => {
    const owner = await signUpOwner(app, database);
    await startChat(owner);
    expect((await createPretendBrowser(app).send('GET', '/api/v1/conversations')).statusCode).toBe(401);
    const staff = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    expect((await staff.ok('GET', '/conversations')).total).toBe(1);
    const ownLeads = await addTeamMember(app, database, owner, { name: 'Olive Own', role: 'staff_own' });
    await ownLeads.refused('GET', '/conversations', undefined, 403);
    const stranger = await signUpOwner(app, database);
    expect((await stranger.ok('GET', '/conversations')).total).toBe(0);
  });
});

describe('takeover and hand back', () => {
  it('takes a conversation over, shows who holds it, and hands it back', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const held = await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    expect(held.heldBy).toMatchObject({ userId: owner.userId });
    expect(new Date(held.heldUntil).getTime()).toBeGreaterThan(Date.now() + 119 * 60 * 1000);
    expect((await owner.ok('GET', `/conversations/${conversationId}`)).heldBy.userId).toBe(owner.userId);
    expect((await owner.ok('GET', '/conversations')).items[0].heldBy.userId).toBe(owner.userId);
    // Taking over your own is fine
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    const handedBack = await owner.ok('POST', `/conversations/${conversationId}/handback`);
    expect(handedBack.heldBy).toBeNull();
    expect(await owner.refused('POST', `/conversations/${conversationId}/handback`, undefined, 409)).toBe('NOT_HELD');
    const events = await database.system
      .selectFrom('domain_events')
      .select('name')
      .where('account_id', '=', owner.businessId)
      .execute();
    expect(events.map((event) => event.name)).toEqual(
      expect.arrayContaining([
        'conversation.held',
        'conversation.released',
        'conversation.message',
        'conversation.started',
      ]),
    );
  });

  it('lets only one person hold a conversation, and lets a manager hand it back', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const staffOne = await addTeamMember(app, database, owner, { name: 'Rahul Staff', role: 'staff' });
    const staffTwo = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    await staffOne.ok('POST', `/conversations/${conversationId}/takeover`);
    expect(await staffTwo.refused('POST', `/conversations/${conversationId}/takeover`, undefined, 409)).toBe(
      'HELD_BY_SOMEONE_ELSE',
    );
    expect(await staffTwo.refused('POST', `/conversations/${conversationId}/handback`, undefined, 409)).toBe(
      'NOT_THE_HOLDER',
    );
    await owner.ok('POST', `/conversations/${conversationId}/handback`);
    // After the hand-back the other person can take it
    await staffTwo.ok('POST', `/conversations/${conversationId}/takeover`);
  });

  it('gives exactly one winner when two people take over at the same moment', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const staffOne = await addTeamMember(app, database, owner, { name: 'Rahul Staff', role: 'staff' });
    const staffTwo = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    const [first, second] = await Promise.all([
      staffOne.send('POST', `/conversations/${conversationId}/takeover`),
      staffTwo.send('POST', `/conversations/${conversationId}/takeover`),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
  });

  it('counts a hold that ran out as no hold, and the clean-up job clears it and says so', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    await database.system
      .updateTable('conversations')
      .set({ held_until: new Date(Date.now() - 1000) })
      .where('id', '=', conversationId)
      .execute();
    expect((await owner.ok('GET', `/conversations/${conversationId}`)).heldBy).toBeNull();
    expect(await records.isHeldByPerson(owner.businessId, conversationId)).toBe(false);
    const inboxService = createConversationInboxService({ database });
    expect(await inboxService.findBusinessesWithExpiredHolds()).toContain(owner.businessId);
    expect(await inboxService.releaseExpiredHoldsOfBusiness(owner.businessId)).toBe(1);
    expect(await inboxService.releaseExpiredHoldsOfBusiness(owner.businessId)).toBe(0);
    const row = await database.system
      .selectFrom('conversations')
      .select(['held_by_user_id', 'held_until'])
      .where('id', '=', conversationId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ held_by_user_id: null, held_until: null });
  });

  it('refuses an ended conversation (409), the own-leads-only role (403), signed out (401), another business (404) and a bad id (400)', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const stranger = await signUpOwner(app, database);
    for (const action of ['takeover', 'handback', 'done']) {
      await stranger.refused('POST', `/conversations/${conversationId}/${action}`, undefined, 404);
      await stranger.refused('POST', `/conversations/${randomUUID()}/${action}`, undefined, 404);
      await owner.refused('POST', `/conversations/not-an-id/${action}`, undefined, 400);
      expect(
        (await createPretendBrowser(app).send('POST', `/api/v1/conversations/${conversationId}/${action}`)).statusCode,
      ).toBe(401);
    }
    const ownLeads = await addTeamMember(app, database, owner, { name: 'Olive Own', role: 'staff_own' });
    await ownLeads.refused('POST', `/conversations/${conversationId}/takeover`, undefined, 403);
    await records.markEnded(owner.businessId, conversationId);
    expect(await owner.refused('POST', `/conversations/${conversationId}/takeover`, undefined, 409)).toBe(
      'CONVERSATION_ENDED',
    );
  });

  it('never takes over a test chat', async () => {
    const owner = await signUpOwner(app, database);
    const testChat = await records.startConversation(owner.businessId, { channel: 'webchat', isTest: true });
    await owner.refused('POST', `/conversations/${testChat}/takeover`, undefined, 404);
  });
});

describe('POST /conversations/{id}/reply', () => {
  it("saves the holder's reply as a staff message with their name, and keeps the hold going", async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    await database.system
      .updateTable('conversations')
      .set({ held_until: new Date(Date.now() + 60_000) })
      .where('id', '=', conversationId)
      .execute();
    const message = await owner.ok(
      'POST',
      `/conversations/${conversationId}/reply`,
      { body: '  Yes, we do. Which dates?  ' },
      201,
    );
    expect(message).toMatchObject({ sender: 'staff', body: 'Yes, we do. Which dates?', byUser: { id: owner.userId } });
    expect((await messagesOf(conversationId)).at(-1)).toEqual({
      sender: 'staff',
      body: 'Yes, we do. Which dates?',
      by_user_id: owner.userId,
    });
    const detail = await owner.ok('GET', `/conversations/${conversationId}`);
    expect(new Date(detail.heldUntil).getTime()).toBeGreaterThan(Date.now() + 119 * 60 * 1000);
    expect(detail.messages.at(-1).byUser.name).toBe(owner.name);
  });

  it('refuses a reply from someone who does not hold it (409), an empty one (400), a too long one (400), another channel (409) and an ended chat (409)', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const staff = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    expect(await owner.refused('POST', `/conversations/${conversationId}/reply`, { body: 'Hi' }, 409)).toBe(
      'NOT_THE_HOLDER',
    );
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    expect(await staff.refused('POST', `/conversations/${conversationId}/reply`, { body: 'Hi' }, 409)).toBe(
      'NOT_THE_HOLDER',
    );
    await owner.refused('POST', `/conversations/${conversationId}/reply`, { body: '   ' }, 400);
    await owner.refused('POST', `/conversations/${conversationId}/reply`, { body: 'x'.repeat(2001) }, 400);
    await owner.refused('POST', `/conversations/${conversationId}/reply`, { body: 'Hi', extra: 1 }, 400);
    const whatsapp = await records.startConversation(owner.businessId, {
      channel: 'whatsapp',
      fromPhoneKey: '971501234567',
    });
    await owner.ok('POST', `/conversations/${whatsapp}/takeover`);
    expect(await owner.refused('POST', `/conversations/${whatsapp}/reply`, { body: 'Hi' }, 409)).toBe(
      'CHANNEL_CANNOT_REPLY_YET',
    );
    await records.markEnded(owner.businessId, conversationId);
    expect(await owner.refused('POST', `/conversations/${conversationId}/reply`, { body: 'Hi' }, 409)).toBe(
      'CONVERSATION_ENDED',
    );
    expect((await owner.ok('GET', `/conversations/${conversationId}`)).heldBy).toBeNull();
    const stranger = await signUpOwner(app, database);
    await stranger.refused('POST', `/conversations/${conversationId}/reply`, { body: 'Hi' }, 404);
    expect(
      (await createPretendBrowser(app).send('POST', `/api/v1/conversations/${conversationId}/reply`, { body: 'Hi' }))
        .statusCode,
    ).toBe(401);
  });
});

describe('POST /conversations/{id}/done', () => {
  it('marks it done and releases the hold, and a new customer message reopens it', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    const done = await owner.ok('POST', `/conversations/${conversationId}/done`);
    expect(done.doneAt).not.toBeNull();
    expect(done.heldBy).toBeNull();
    expect((await owner.ok('GET', '/conversations?status=done')).items).toHaveLength(1);
    // Done twice changes nothing
    expect((await owner.ok('POST', `/conversations/${conversationId}/done`)).doneAt).toBe(done.doneAt);
    await records.addMessage(owner.businessId, conversationId, { sender: 'customer', body: 'One more thing' });
    expect((await owner.ok('GET', `/conversations/${conversationId}`)).doneAt).toBeNull();
    expect((await owner.ok('GET', '/conversations?status=open')).items).toHaveLength(1);
  });
});

describe('the AI never replies while a person holds the conversation', () => {
  it("saves the customer's message and says nothing when a person holds it", async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    let agentWasAsked = false;
    const savedTurns = createAgentSavedTurnService({
      database,
      runtime: {
        runTurn: async () => {
          agentWasAsked = true;
          return pretendTurn('I am the AI');
        },
      } as never,
    });
    const result = await savedTurns.answerAndSave({
      accountId: owner.businessId,
      conversationId,
      startConversation: { channel: 'webchat' },
      earlierMessages: [],
      message: 'Are you there?',
      channel: 'webchat',
      actor: { kind: 'system', id: 'test' },
    });
    expect(result).toMatchObject({ conversationId, turn: null, heldByPerson: true });
    expect(agentWasAsked).toBe(false);
    expect((await messagesOf(conversationId)).map((message) => message.sender)).toEqual(['customer', 'customer']);
  });

  it("throws the AI's reply away when a person takes over while the AI is thinking", async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    const savedTurns = createAgentSavedTurnService({
      database,
      runtime: {
        runTurn: async () => {
          // The person clicks "I'll handle this" while the AI is still working out its answer
          await owner.ok('POST', `/conversations/${conversationId}/takeover`);
          return pretendTurn('The AI answered too late');
        },
      } as never,
    });
    const result = await savedTurns.answerAndSave({
      accountId: owner.businessId,
      conversationId,
      startConversation: { channel: 'webchat' },
      earlierMessages: [],
      message: 'Hello again',
      channel: 'webchat',
      actor: { kind: 'system', id: 'test' },
    });
    expect(result.heldByPerson).toBe(true);
    const senders = (await messagesOf(conversationId)).map((message) => message.sender);
    expect(senders).toEqual(['customer', 'customer']);
    expect(senders).not.toContain('agent');
  });

  it('answers as usual when nobody holds it, and shows the agent what a person said after a hand-back', async () => {
    const owner = await signUpOwner(app, database);
    const conversationId = await startChat(owner);
    await owner.ok('POST', `/conversations/${conversationId}/takeover`);
    await owner.ok(
      'POST',
      `/conversations/${conversationId}/reply`,
      { body: 'I will send you the quote by 5pm.' },
      201,
    );
    await owner.ok('POST', `/conversations/${conversationId}/handback`);
    let sawTeamPromise = false;
    const savedTurns = createAgentSavedTurnService({
      database,
      runtime: {
        runTurn: async (turn: { messages: Array<{ text: string }> }) => {
          sawTeamPromise = turn.messages.some(
            (message) =>
              message.text.includes('I will send you the quote by 5pm.') && message.text.includes('team member'),
          );
          return pretendTurn('Noted.');
        },
      } as never,
    });
    const earlier = await records.readChatMessages(owner.businessId, conversationId);
    const result = await savedTurns.answerAndSave({
      accountId: owner.businessId,
      conversationId,
      startConversation: { channel: 'webchat' },
      earlierMessages: earlier,
      message: 'Thanks',
      channel: 'webchat',
      actor: { kind: 'system', id: 'test' },
    });
    expect(result.heldByPerson).toBe(false);
    expect(sawTeamPromise).toBe(true);
    expect((await messagesOf(conversationId)).at(-1)?.sender).toBe('agent');
  });
});
