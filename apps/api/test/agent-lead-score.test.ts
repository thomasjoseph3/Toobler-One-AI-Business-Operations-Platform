import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { EMPTY_AGENT_CONVERSATION_STATE, type AgentConversationState } from '../src/modules/core/agents';
import * as conversationFactsRepository from '../src/modules/core/agents/repositories/conversation-facts.repository';
import { handleOutcomesApplied } from '../src/modules/core/agents/services/agent-facts-applier.service';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// F10 slice 2: what the AI heard (asked the price, asked to book, dates) scores the conversation's lead, by fixed rules.

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** A date this many days from today, as a plain date (the test business is in the default time zone; a day's slack is allowed by the margins used). */
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** A contact with a lead, and a conversation whose AI facts are these. */
async function conversationWith(stateChanges: Partial<AgentConversationState>, owner?: TeamMember) {
  const businessOwner = owner ?? (await signUpOwner(app, database));
  const contact = await businessOwner.ok('POST', '/contacts', { name: 'Priya Menon', phone: uniqueUaeNumber() }, 201);
  const lead = await businessOwner.ok('POST', '/leads', { contactId: contact.id }, 201);
  const conversationId = randomUUID();
  await database.system
    .insertInto('conversations')
    .values({
      id: conversationId,
      account_id: businessOwner.businessId,
      channel: 'webchat',
      from_phone_key: null,
      from_email: null,
      contact_id: contact.id,
    })
    .execute();
  await database.runInAccountTransaction(businessOwner.businessId, (transaction) =>
    conversationFactsRepository.saveConversationState(transaction, {
      accountId: businessOwner.businessId,
      conversationId,
      state: { ...EMPTY_AGENT_CONVERSATION_STATE, ...stateChanges },
      promiseMadeAt: null,
      actor: { kind: 'agent', id: 'test' },
    }),
  );
  return { owner: businessOwner, contact, lead, conversationId };
}

async function deliver(owner: TeamMember, conversationId: string, contactId: string, leadId: string, times = 1) {
  const event: DomainEvent = {
    id: randomUUID(),
    accountId: owner.businessId,
    name: 'conversation.outcomes_applied',
    payload: { conversationId, contactId, leadIds: [leadId], ticketIds: [] },
    occurredAt: new Date(),
  };
  for (let attempt = 0; attempt < times; attempt += 1) {
    await handleOutcomesApplied(
      event,
      createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' }),
    );
  }
}

describe('scoring a lead from its conversation', () => {
  it('makes it hot when the customer asked to book', async () => {
    const { owner, contact, lead, conversationId } = await conversationWith({ situation: 'ready_to_book' });
    await deliver(owner, conversationId, contact.id, lead.id);
    expect(await owner.ok('GET', `/leads/${lead.id}`)).toMatchObject({
      temperature: 'hot',
      temperatureReason: 'Asked to book',
      temperatureSetBy: 'rules',
    });
  });

  it('puts the dates on the lead and makes it hot with a price question and dates within 30 days', async () => {
    const { owner, contact, lead, conversationId } = await conversationWith({
      askedPrice: true,
      dateFrom: daysFromNow(10),
      dateTo: daysFromNow(12),
    });
    await deliver(owner, conversationId, contact.id, lead.id);
    const scored = await owner.ok('GET', `/leads/${lead.id}`);
    expect(scored).toMatchObject({ temperature: 'hot', dateFrom: daysFromNow(10), dateTo: daysFromNow(12) });
    expect(scored.temperatureReason).toContain('asked the price');
  });

  it('makes it cold with only general questions, and warm with a price question alone', async () => {
    const cold = await conversationWith({});
    await deliver(cold.owner, cold.conversationId, cold.contact.id, cold.lead.id);
    expect((await cold.owner.ok('GET', `/leads/${cold.lead.id}`)).temperature).toBe('cold');
    const warm = await conversationWith({ askedPrice: true });
    await deliver(warm.owner, warm.conversationId, warm.contact.id, warm.lead.id);
    expect((await warm.owner.ok('GET', `/leads/${warm.lead.id}`)).temperature).toBe('warm');
  });

  it('never overrides dates staff typed, and a new conversation replaces a temperature set by hand', async () => {
    const { owner, contact, lead, conversationId } = await conversationWith({
      askedPrice: true,
      dateFrom: daysFromNow(10),
    });
    await owner.ok('PATCH', `/leads/${lead.id}`, { dateFrom: '2031-01-01' });
    await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'cold' });
    await deliver(owner, conversationId, contact.id, lead.id, 2);
    const after = await owner.ok('GET', `/leads/${lead.id}`);
    expect(after.dateFrom).toBe('2031-01-01');
    expect(after).toMatchObject({ temperature: 'warm', temperatureSetBy: 'rules' });
  });

  it('writes one activity line for the first scoring, with the field name only', async () => {
    const { owner, contact, lead, conversationId } = await conversationWith({ askedPrice: true });
    await deliver(owner, conversationId, contact.id, lead.id, 2);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'leads.scored')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.actor).toMatchObject({ kind: 'agent' });
  });
});
