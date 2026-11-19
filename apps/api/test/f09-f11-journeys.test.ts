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
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// Journey tests for custom fields (F09), lead scoring (F10) and views and search (F11): whole stories told as one route after another, by real people
// with their own sessions. The other tests check one route at a time; these check that the features work TOGETHER.

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

const contextFor = (owner: TeamMember) =>
  createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' });

describe('journey: the life of a custom field', () => {
  it('add fields → fill them in on a contact and a lead → Won is refused until the required one is filled → reorder → remove → hidden → purged after 30 days', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });

    // Only a manager adds fields; staff cannot
    await colleague.refused('POST', '/fields', { object: 'lead', label: 'Guest count', type: 'number' }, 403);
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Car model', type: 'text', aiAsks: true }, 201);
    const guests = await owner.ok('POST', '/fields', { object: 'lead', label: 'Guest count', type: 'number' }, 201);
    const deposit = await owner.ok(
      'POST',
      '/fields',
      { object: 'lead', label: 'Deposit', type: 'yes_no', requiredForWon: true },
      201,
    );

    // Staff fill them in on a contact and its lead
    const contact = await colleague.ok(
      'POST',
      '/contacts',
      { name: 'Priya Menon', phone: uniqueUaeNumber(), custom: { car_model: 'Swift' } },
      201,
    );
    const lead = await colleague.ok('POST', '/leads', { contactId: contact.id, custom: { guest_count: '1,200' } }, 201);
    expect(lead.custom).toEqual({ guest_count: 1200 });
    await colleague.refused('PATCH', `/leads/${lead.id}`, { custom: { guest_count: 'lots' } }, 400);

    // Won is refused while the required field is empty, and allowed once it is filled
    const pipeline = await owner.ok('GET', '/pipeline');
    const wonStage = pipeline.stages.find((stage: { kind: string }) => stage.kind === 'won');
    expect(await colleague.refused('POST', `/leads/${lead.id}/move`, { stageId: wonStage.id }, 400)).toBe(
      'REQUIRED_FIELDS_MISSING',
    );
    await colleague.ok('PATCH', `/leads/${lead.id}`, { custom: { deposit: 'yes' } });
    expect((await colleague.ok('POST', `/leads/${lead.id}/move`, { stageId: wonStage.id })).stage.kind).toBe('won');

    // The manager reorders, then removes a field: its answers are hidden at once but kept
    const fields = (await owner.ok('GET', '/fields?object=lead')).items;
    await owner.ok('POST', '/fields/reorder', { object: 'lead', ids: [fields[1].id, fields[0].id] });
    await owner.ok('DELETE', `/fields/${guests.id}`, undefined, 204);
    expect((await colleague.ok('GET', `/leads/${lead.id}`)).custom).toEqual({ deposit: true });
    const stored = await database.system
      .selectFrom('leads')
      .select('custom')
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(stored.custom).toMatchObject({ guest_count: 1200 });

    // 30 days later the nightly purge deletes the hidden answers for good, and only those
    await database.system
      .updateTable('field_definitions')
      .set({ archived_at: new Date(Date.now() - 40 * 86_400_000) })
      .where('id', '=', guests.id)
      .execute();
    expect(await purgeRemovedFieldsForBusiness(contextFor(owner), new Date())).toBe(1);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'field.values_purged')
      .execute();
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      for (const handler of [purgeContactAnswers, purgeLeadAnswers]) {
        await handler(
          { id: event.id, accountId: owner.businessId, name: event.name, payload, occurredAt: new Date() },
          contextFor(owner),
        );
      }
    }
    const after = await database.system
      .selectFrom('leads')
      .select('custom')
      .where('id', '=', lead.id)
      .executeTakeFirstOrThrow();
    expect(after.custom).toEqual({ deposit: true });
    expect(deposit.id).toBeTruthy();
  });
});

describe('journey: a lead is scored by what the customer said', () => {
  it('a new lead → the conversation says price and dates → hot with a reason → a person overrides it → the next conversation scores it again', async () => {
    const owner = await signUpOwner(app, database);
    const contact = await owner.ok('POST', '/contacts', { name: 'Meera Shah', phone: uniqueUaeNumber() }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: contact.id }, 201);
    expect(lead).toMatchObject({ temperature: 'unscored', temperatureReason: null });

    const startConversation = async (state: Partial<typeof EMPTY_AGENT_CONVERSATION_STATE>) => {
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
          state: { ...EMPTY_AGENT_CONVERSATION_STATE, ...state },
          promiseMadeAt: null,
          actor: { kind: 'agent', id: 'test' },
        }),
      );
      const event: DomainEvent = {
        id: randomUUID(),
        accountId: owner.businessId,
        name: 'conversation.outcomes_applied',
        payload: { conversationId, contactId: contact.id, leadIds: [lead.id], ticketIds: [] },
        occurredAt: new Date(),
      };
      await handleOutcomesApplied(event, contextFor(owner));
    };

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await startConversation({ askedPrice: true, dateFrom: soon });
    expect(await owner.ok('GET', `/leads/${lead.id}`)).toMatchObject({ temperature: 'hot', temperatureSetBy: 'rules' });

    // A person overrides it: that wins, and says so
    await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'cold' });
    expect(await owner.ok('GET', `/leads/${lead.id}`)).toMatchObject({
      temperature: 'cold',
      temperatureReason: 'Set by hand',
      temperatureSetBy: 'manual',
    });

    // The customer comes back and asks to book: the rules score it again and replace the hand-set value
    await startConversation({ situation: 'ready_to_book' });
    expect(await owner.ok('GET', `/leads/${lead.id}`)).toMatchObject({
      temperature: 'hot',
      temperatureReason: 'Asked to book',
      temperatureSetBy: 'rules',
    });
  });
});

describe('journey: finding things and saving views', () => {
  it('search finds the person, their company and their lead → a manager saves and shares a view → staff see it, cannot change it → the manager renames and deletes it', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    const priya = await owner.ok('POST', '/contacts', { name: 'Priya Menon', phone: '+919847012345' }, 201);
    await owner.ok('POST', '/companies', { name: 'Menon Weddings' }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: priya.id, interest: 'Hall' }, 201);

    // The manager finds all three; the "own leads only" colleague finds the person and company but not the lead until it is theirs
    const found = await owner.ok('GET', '/search?q=98470');
    expect(found.contacts).toHaveLength(1);
    expect((await owner.ok('GET', '/search?q=menon')).leads).toHaveLength(1);
    expect((await colleague.ok('GET', '/search?q=menon')).leads).toEqual([]);
    await owner.ok('POST', `/leads/${lead.id}/assign`, { ownerUserId: colleague.userId });
    expect((await colleague.ok('GET', '/search?q=menon')).leads).toHaveLength(1);

    // The manager saves a view and shares it; the colleague sees it as not theirs and cannot change it
    const view = await owner.ok(
      'POST',
      '/views',
      { object: 'lead', name: 'My hot leads', filters: { owner: 'me' } },
      201,
    );
    expect((await colleague.ok('GET', '/views?object=lead')).items).toEqual([]);
    await owner.ok('PATCH', `/views/${view.id}`, { shared: true });
    expect((await colleague.ok('GET', '/views?object=lead')).items[0]).toMatchObject({
      name: 'My hot leads',
      isMine: false,
    });
    await colleague.refused('PATCH', `/views/${view.id}`, { name: 'Mine now' }, 403);
    await colleague.refused('DELETE', `/views/${view.id}`, undefined, 403);

    // The manager renames it, then deletes it: it disappears for everyone
    expect((await owner.ok('PATCH', `/views/${view.id}`, { name: 'Hot, mine' })).name).toBe('Hot, mine');
    await owner.ok('DELETE', `/views/${view.id}`, undefined, 204);
    expect((await colleague.ok('GET', '/views?object=lead')).items).toEqual([]);
    expect((await owner.ok('GET', '/views?object=lead')).items).toEqual([]);
  });
});

describe('journey: filtering, then keeping a group of contacts as a list', () => {
  it('add fields and contacts → filter contacts and leads → save the matching contacts as a list → add and remove people → staff cannot delete it → a manager does', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    await owner.ok(
      'POST',
      '/fields',
      { object: 'contact', label: 'Car', type: 'dropdown', options: ['Swift', 'Baleno'] },
      201,
    );
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Guests', type: 'number' }, 201);
    const make = async (name: string, car: string, guests: number) => {
      const contact = await owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber(), custom: { car } }, 201);
      const lead = await owner.ok('POST', '/leads', { contactId: contact.id, custom: { guests } }, 201);
      return { contact: contact.id as string, lead: lead.id as string };
    };
    const priya = await make('Priya Menon', 'Swift', 50);
    const rahul = await make('Rahul Nair', 'Baleno', 300);
    const meera = await make('Meera Menon', 'Swift', 120);

    // Filter the leads and the contacts with the same engine
    const bigLeads = await colleague.ok(
      'GET',
      `/leads?filters=${encodeURIComponent(JSON.stringify([{ field: 'custom.guests', operator: 'greater_than', value: 100 }]))}`,
    );
    expect(bigLeads.items.map((lead: { id: string }) => lead.id).sort()).toEqual([rahul.lead, meera.lead].sort());
    const swiftFilter = JSON.stringify([{ field: 'custom.car', operator: 'is', value: 'Swift' }]);
    const swiftContacts = await colleague.ok('GET', `/contacts?filters=${encodeURIComponent(swiftFilter)}`);
    expect(swiftContacts.total).toBe(2);

    // Save the contacts matching that view as a list (staff may make lists)
    const list = await colleague.ok(
      'POST',
      '/lists',
      { name: 'Swift owners', fromView: { filters: swiftFilter } },
      201,
    );
    expect(list.memberCount).toBe(2);

    // Add another by hand, then take one out; the contacts themselves are untouched
    await colleague.ok('POST', `/lists/${list.id}/members`, { contactIds: [rahul.contact] });
    await colleague.ok('DELETE', `/lists/${list.id}/members/${priya.contact}`, undefined, 204);
    const people = (await owner.ok('GET', `/lists/${list.id}/members`)).items
      .map((person: { id: string }) => person.id)
      .sort();
    expect(people).toEqual([meera.contact, rahul.contact].sort());
    expect((await owner.ok('GET', `/contacts/${priya.contact}`)).id).toBe(priya.contact);

    // Only a manager deletes the list
    await colleague.refused('DELETE', `/lists/${list.id}`, undefined, 403);
    await owner.ok('DELETE', `/lists/${list.id}`, undefined, 204);
    expect((await colleague.ok('GET', '/lists')).items).toEqual([]);
  });
});
