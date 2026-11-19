import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../src/modules/core/agents';
import { saveDetailsInputSchema } from '../src/modules/core/agents/helpers/agent-conversation-state';
import { handleOutcomesApplied } from '../src/modules/core/agents/services/agent-facts-applier.service';
import * as conversationFactsRepository from '../src/modules/core/agents/repositories/conversation-facts.repository';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner, type TeamMember } from './support/team';

// F05 slice 4: the company a customer names to the AI ("I'm booking for Infosys HR") is saved on their contact once the conversation's contact is made.

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

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** A conversation whose AI facts say the customer named this company (or none), with a contact made for it. Returns the pieces a test needs. */
async function conversationWithCompany(owner: TeamMember, companyName: string | undefined) {
  const contact = await owner.ok('POST', '/contacts', { name: 'Priya Menon', phone: uniqueUaeNumber() }, 201);
  const conversationId = randomUUID();
  await database.system
    .insertInto('conversations')
    .values({
      id: conversationId,
      account_id: owner.businessId,
      channel: 'webchat',
      from_phone_key: null,
      from_email: null,
      contact_id: contact.id,
    })
    .execute();
  if (companyName !== undefined) {
    const state = { ...EMPTY_AGENT_CONVERSATION_STATE, details: { Company: companyName, 'Interested in': 'a hall' } };
    await database.runInAccountTransaction(owner.businessId, (transaction) =>
      conversationFactsRepository.saveConversationState(transaction, {
        accountId: owner.businessId,
        conversationId,
        state,
        promiseMadeAt: null,
        actor: { kind: 'agent', id: 'test' },
      }),
    );
  }
  return { contact, conversationId };
}

/** Delivers the "outcomes applied" event for the conversation to the agents module's handler, the way the dispatcher would. */
async function deliver(owner: TeamMember, conversationId: string, contactId: string | null, times = 1) {
  const event: DomainEvent = {
    id: randomUUID(),
    accountId: owner.businessId,
    name: 'conversation.outcomes_applied',
    payload: { conversationId, contactId, leadIds: [], ticketIds: [] },
    occurredAt: new Date(),
  };
  for (let attempt = 0; attempt < times; attempt += 1) {
    await handleOutcomesApplied(
      event,
      createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' }),
    );
  }
}

describe('the company the AI heard', () => {
  it('is kept with what the customer said (the AI is told to save it)', () => {
    expect(saveDetailsInputSchema.safeParse({ company: 'Infosys HR' }).success).toBe(true);
    expect(saveDetailsInputSchema.safeParse({ company: '' }).success).toBe(false);
  });

  it('makes the company, puts the contact in it, and logs it with ids only', async () => {
    const owner = await signUpOwner(app, database);
    const { contact, conversationId } = await conversationWithCompany(owner, 'Infosys HR');
    await deliver(owner, conversationId, contact.id);

    const companies = (await owner.ok('GET', '/companies')).items;
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ name: 'Infosys HR', contactCount: 1 });
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).companyId).toBe(companies[0].id);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'contacts.company_changed')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.actor).toMatchObject({ kind: 'agent' });
    expect(JSON.stringify(lines)).not.toContain('Infosys HR');
  });

  it('uses the company the business already has, whatever the capitals and spaces, and does not make a second', async () => {
    const owner = await signUpOwner(app, database);
    const existing = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const { contact, conversationId } = await conversationWithCompany(owner, 'infosys   hr');
    await deliver(owner, conversationId, contact.id);
    expect((await owner.ok('GET', '/companies')).items).toHaveLength(1);
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).companyId).toBe(existing.id);
  });

  it('never overrides the company staff chose, and is safe when delivered twice', async () => {
    const owner = await signUpOwner(app, database);
    const staffsChoice = await owner.ok('POST', '/companies', { name: 'Chosen Ltd' }, 201);
    const { contact, conversationId } = await conversationWithCompany(owner, 'Infosys HR');
    await owner.ok('PUT', `/contacts/${contact.id}/company`, { companyId: staffsChoice.id });
    await deliver(owner, conversationId, contact.id, 2);
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).companyId).toBe(staffsChoice.id);

    const second = await conversationWithCompany(owner, 'Wipro HR');
    await deliver(owner, second.conversationId, second.contact.id, 2);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'contacts.company_changed')
      .execute();
    // Staff's own change (1) and the AI's one change for the second contact (1): the repeat delivery added nothing
    expect(lines).toHaveLength(2);
  });

  it('does nothing when the customer named no company, or there is no contact, or the name cannot be a company name', async () => {
    const owner = await signUpOwner(app, database);
    const none = await conversationWithCompany(owner, undefined);
    await deliver(owner, none.conversationId, none.contact.id);
    const noContact = await conversationWithCompany(owner, 'Infosys HR');
    await deliver(owner, noContact.conversationId, null);
    const tooLong = await conversationWithCompany(owner, 'x'.repeat(150));
    await deliver(owner, tooLong.conversationId, tooLong.contact.id);
    expect((await owner.ok('GET', '/companies')).items).toEqual([]);
  });

  it('never reaches across businesses: a conversation id of another business finds no facts', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const theirs = await conversationWithCompany(stranger, 'Strangers Ltd');
    const mine = await owner.ok('POST', '/contacts', { name: 'Priya', phone: uniqueUaeNumber() }, 201);
    await deliver(owner, theirs.conversationId, mine.id);
    expect((await owner.ok('GET', '/companies')).items).toEqual([]);
    expect((await stranger.ok('GET', '/companies')).items).toEqual([]);
  });
});
