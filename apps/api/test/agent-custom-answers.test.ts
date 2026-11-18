import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../src/modules/core/agents';
import * as conversationFactsRepository from '../src/modules/core/agents/repositories/conversation-facts.repository';
import { handleOutcomesApplied } from '../src/modules/core/agents/services/agent-facts-applier.service';
import { handleFieldValuesPurged as purgeContactAnswers } from '../src/modules/core/contacts/services/field-purge-events.service';
import { handleFieldValuesPurged as purgeLeadAnswers } from '../src/modules/core/leads/services/field-purge-events.service';
import { purgeRemovedFieldsForBusiness } from '../src/modules/core/fields/services/purge-removed-fields.service';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner, type TeamMember } from './support/team';

// F09 slice 5: what the AI heard for the business's own questions is added to the contact and lead, and the answers of fields removed over 30 days
// ago are deleted for good.

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
const contextFor = (owner: TeamMember) =>
  createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' });

/** A business with one contact field and one lead field the AI asks about, a contact with a lead, and a conversation holding the AI's answers. */
async function conversationWithAnswers(customAnswers: Record<string, string | number | boolean>) {
  const owner = await signUpOwner(app, database);
  await owner.ok('POST', '/fields', { object: 'contact', label: 'Car model', type: 'text', aiAsks: true }, 201);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'Guest count', type: 'number', aiAsks: true }, 201);
  const contact = await owner.ok('POST', '/contacts', { name: 'Priya Menon', phone: uniqueUaeNumber() }, 201);
  const lead = await owner.ok('POST', '/leads', { contactId: contact.id }, 201);
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
  await database.runInAccountTransaction(owner.businessId, (transaction) =>
    conversationFactsRepository.saveConversationState(transaction, {
      accountId: owner.businessId,
      conversationId,
      state: { ...EMPTY_AGENT_CONVERSATION_STATE, customAnswers },
      promiseMadeAt: null,
      actor: { kind: 'agent', id: 'test' },
    }),
  );
  return { owner, contact, lead, conversationId };
}

/** Delivers the "outcomes applied" event to the agents module's handler, the way the dispatcher would. */
async function deliver(owner: TeamMember, conversationId: string, contactId: string, leadIds: string[], times = 1) {
  const event: DomainEvent = {
    id: randomUUID(),
    accountId: owner.businessId,
    name: 'conversation.outcomes_applied',
    payload: { conversationId, contactId, leadIds, ticketIds: [] },
    occurredAt: new Date(),
  };
  for (let attempt = 0; attempt < times; attempt += 1) await handleOutcomesApplied(event, contextFor(owner));
}

describe('what the AI heard for the business’s own questions', () => {
  it('is added to the contact and the lead, logged with field names only, and safe when delivered twice', async () => {
    const { owner, contact, lead, conversationId } = await conversationWithAnswers({
      'contact.car_model': 'Swift',
      'lead.guest_count': 120,
    });
    await deliver(owner, conversationId, contact.id, [lead.id], 2);

    expect((await owner.ok('GET', `/contacts/${contact.id}`)).custom).toEqual({ car_model: 'Swift' });
    expect((await owner.ok('GET', `/leads/${lead.id}`)).custom).toEqual({ guest_count: 120 });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', 'in', ['contacts.custom_answers_added', 'leads.custom_answers_added'])
      .execute();
    expect(lines.filter((line) => line.kind === 'contacts.custom_answers_added').length).toBeGreaterThan(0);
    expect(lines.every((line) => (line.actor as { kind: string }).kind === 'agent')).toBe(true);
    expect(JSON.stringify(lines)).not.toContain('Swift');
  });

  it('never overrides an answer staff already typed', async () => {
    const { owner, contact, lead, conversationId } = await conversationWithAnswers({ 'contact.car_model': 'Swift' });
    await owner.ok('PATCH', `/contacts/${contact.id}`, { custom: { car_model: 'Baleno' } });
    await deliver(owner, conversationId, contact.id, [lead.id]);
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).custom).toEqual({ car_model: 'Baleno' });
  });

  it('skips a field that was removed after the customer answered', async () => {
    const { owner, contact, lead, conversationId } = await conversationWithAnswers({ 'contact.car_model': 'Swift' });
    const fields = (await owner.ok('GET', '/fields?object=contact')).items;
    await owner.ok('DELETE', `/fields/${fields[0].id}`, undefined, 204);
    await deliver(owner, conversationId, contact.id, [lead.id]);
    const stored = await database.system
      .selectFrom('contacts')
      .select('custom')
      .where('id', '=', contact.id)
      .executeTakeFirstOrThrow();
    expect(stored.custom).toEqual({});
  });
});

describe('the purge of removed fields', () => {
  it('deletes the answers of fields removed over 30 days ago, and keeps the rest', async () => {
    const owner = await signUpOwner(app, database);
    const oldField = await owner.ok('POST', '/fields', { object: 'contact', label: 'Old thing', type: 'text' }, 201);
    const recentField = await owner.ok(
      'POST',
      '/fields',
      { object: 'contact', label: 'Recent thing', type: 'text' },
      201,
    );
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Kept thing', type: 'text' }, 201);
    const contact = await owner.ok(
      'POST',
      '/contacts',
      { phone: uniqueUaeNumber(), custom: { old_thing: 'a', recent_thing: 'b', kept_thing: 'c' } },
      201,
    );
    await owner.ok('DELETE', `/fields/${oldField.id}`, undefined, 204);
    await owner.ok('DELETE', `/fields/${recentField.id}`, undefined, 204);
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await database.system
      .updateTable('field_definitions')
      .set({ archived_at: fortyDaysAgo })
      .where('id', '=', oldField.id)
      .execute();

    expect(await purgeRemovedFieldsForBusiness(contextFor(owner), new Date())).toBe(1);
    expect(await purgeRemovedFieldsForBusiness(contextFor(owner), new Date())).toBe(0);

    // The event goes through the outbox; here it is delivered to the two handlers directly, the way the dispatcher would
    const outbox = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'field.values_purged')
      .execute();
    expect(outbox).toHaveLength(1);
    for (const handler of [purgeContactAnswers, purgeLeadAnswers]) {
      await handler(
        {
          id: outbox[0]!.id,
          accountId: owner.businessId,
          name: 'field.values_purged',
          payload: outbox[0]!.payload as Record<string, unknown>,
          occurredAt: new Date(),
        },
        contextFor(owner),
      );
    }
    const stored = await database.system
      .selectFrom('contacts')
      .select('custom')
      .where('id', '=', contact.id)
      .executeTakeFirstOrThrow();
    expect(stored.custom).toEqual({ recent_thing: 'b', kept_thing: 'c' });
  });
});
