import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { detectDuplicatesForBusiness } from '../src/modules/core/duplicates';
import { buildTestApp } from './support/app';
import { createPretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F13: GET /duplicates, POST /duplicates/{id}/merge and POST /duplicates/{id}/dismiss, and the nightly search.

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

/** Runs the nightly search for one business, as the job does. Returns how many new pairs it found. */
async function runDetection(owner: TeamMember): Promise<number> {
  return detectDuplicatesForBusiness(createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' }));
}

/** A business with two contacts that look like one person: the same name, phones one digit apart. */
async function businessWithTwinContacts() {
  const owner = await signUpOwner(app, database);
  const first = await owner.ok(
    'POST',
    '/contacts',
    { name: 'Anil Kumar', phone: '+971501234567', language: 'en' },
    201,
  );
  const second = await owner.ok(
    'POST',
    '/contacts',
    { name: 'anil  kumar', phone: '+971501234568', email: 'anil@example.com' },
    201,
  );
  expect(await runDetection(owner)).toBe(1);
  const { items } = await owner.ok('GET', '/duplicates?object=contact');
  expect(items).toHaveLength(1);
  return { owner, first, second, suggestion: items[0] };
}

describe('the nightly search and GET /duplicates', () => {
  it('finds two contacts that look like one person, with the reason, and finds them only once', async () => {
    const { owner, first, second, suggestion } = await businessWithTwinContacts();
    expect(suggestion.reasons).toEqual(['same_name_similar_phone']);
    expect([suggestion.a.id, suggestion.b.id].sort()).toEqual([first.id, second.id].sort());
    expect(suggestion).toMatchObject({ object: 'contact', aHasOpenLead: false, bHasOpenLead: false });
    expect(await runDetection(owner)).toBe(0);
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toHaveLength(1);
    expect((await owner.ok('GET', '/duplicates?object=company')).items).toEqual([]);
  });

  it('never pairs different people', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/contacts', { name: 'Anil Kumar', phone: '+971501234567' }, 201);
    await owner.ok('POST', '/contacts', { name: 'Meera Nair', phone: '+971501234568' }, 201);
    await owner.ok('POST', '/contacts', { name: 'Anil Kumar', phone: '+971509999999' }, 201);
    expect(await runDetection(owner)).toBe(0);
  });

  it('finds two companies that look like one firm', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Infosys' }, 201);
    await owner.ok('POST', '/companies', { name: 'Infosys Pvt Ltd' }, 201);
    expect(await runDetection(owner)).toBe(1);
    const { items } = await owner.ok('GET', '/duplicates?object=company');
    expect(items).toHaveLength(1);
    expect(items[0].reasons).toEqual(['same_name_without_suffix']);
  });

  it('leaves out a pair when one of the two is deleted, and shows each business only its own pairs', async () => {
    const { owner, first } = await businessWithTwinContacts();
    const other = await signUpOwner(app, database);
    expect((await other.ok('GET', '/duplicates?object=contact')).items).toEqual([]);
    await owner.ok('DELETE', `/contacts/${first.id}`, undefined, 204);
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toEqual([]);
  });

  it('refuses a missing or wrong object (400), a signed-out caller (401), and lets any signed-in staff read it', async () => {
    const owner = await signUpOwner(app, database);
    expect((await owner.send('GET', '/duplicates')).statusCode).toBe(400);
    expect((await owner.send('GET', '/duplicates?object=lead')).statusCode).toBe(400);
    expect((await createPretendBrowser(app).send('GET', '/api/v1/duplicates?object=contact')).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own'] as const) {
      const member = await addTeamMember(app, database, owner, { name: `Reader ${role}`, role });
      await member.ok('GET', '/duplicates?object=contact');
    }
  });
});

describe('POST /duplicates/{id}/dismiss', () => {
  it('says "Not the same" for good: the pair is hidden and the next search never brings it back', async () => {
    const { owner, suggestion } = await businessWithTwinContacts();
    const staff = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    expect(await staff.ok('POST', `/duplicates/${suggestion.id}/dismiss`)).toEqual({
      id: suggestion.id,
      status: 'dismissed',
    });
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toEqual([]);
    expect(await runDetection(owner)).toBe(0);
    expect(await runDetection(owner)).toBe(0);
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toEqual([]);
    expect(await owner.refused('POST', `/duplicates/${suggestion.id}/dismiss`, undefined, 409)).toBe('ALREADY_DECIDED');
  });

  it('answers 404 for an unknown pair and for another business, 400 for a bad id, 401 signed out', async () => {
    const { suggestion } = await businessWithTwinContacts();
    const stranger = await signUpOwner(app, database);
    await stranger.refused('POST', `/duplicates/${suggestion.id}/dismiss`, undefined, 404);
    await stranger.refused('POST', `/duplicates/${randomUUID()}/dismiss`, undefined, 404);
    await stranger.refused('POST', '/duplicates/not-an-id/dismiss', undefined, 400);
    expect(
      (await createPretendBrowser(app).send('POST', `/api/v1/duplicates/${suggestion.id}/dismiss`)).statusCode,
    ).toBe(401);
  });
});

describe('POST /duplicates/{id}/merge: contacts', () => {
  it('moves leads, tasks, notes, tickets and lists to the kept contact, takes the chosen values and keeps both originals', async () => {
    const { owner, first, second, suggestion } = await businessWithTwinContacts();
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Car model', type: 'text' }, 201);
    await owner.ok('PATCH', `/contacts/${second.id}`, { custom: { car_model: 'Swift' } });
    const lead = await owner.ok('POST', '/leads', { contactId: second.id }, 201);
    await owner.ok(
      'POST',
      '/tasks',
      { leadId: lead.id, kind: 'call', title: 'Call Anil', dueAt: '2030-01-01T10:00:00Z' },
      201,
    );
    await owner.ok('POST', '/notes', { contactId: second.id, body: 'Prefers mornings' }, 201);
    await owner.ok(
      'POST',
      '/tickets',
      { contactId: second.id, title: 'Late invoice', type: 'complaint', priority: 'normal' },
      201,
    );
    const list = await owner.ok('POST', '/lists', { name: 'Diwali', contactIds: [second.id, first.id] }, 201);

    const result = await owner.ok('POST', `/duplicates/${suggestion.id}/merge`, {
      keep: suggestion.a.id === first.id ? 'a' : 'b',
      take: {
        phone: suggestion.a.id === first.id ? 'b' : 'a',
        custom: { car_model: suggestion.a.id === first.id ? 'b' : 'a' },
      },
    });
    expect(result).toEqual({ object: 'contact', keptId: first.id, mergedAwayId: second.id });

    // The kept contact has the other's phone, its own language, the email it was missing and the custom answer
    const kept = await owner.ok('GET', `/contacts/${first.id}`);
    expect(kept).toMatchObject({
      phone: '+971501234568',
      language: 'en',
      email: 'anil@example.com',
      custom: { car_model: 'Swift' },
    });
    await owner.refused('GET', `/contacts/${second.id}`, undefined, 404);
    // Everything moved
    expect((await owner.ok('GET', `/leads/${lead.id}`)).contact.id).toBe(first.id);
    const countOf = async (table: 'tasks' | 'tickets' | 'activities' | 'leads') =>
      (await database.system.selectFrom(table).select('id').where('contact_id', '=', first.id).execute()).length;
    expect(await countOf('leads')).toBe(1);
    expect(await countOf('tasks')).toBe(1);
    expect(await countOf('tickets')).toBe(1);
    expect(await countOf('activities')).toBeGreaterThanOrEqual(1);
    expect(
      (
        await database.system
          .selectFrom('contact_list_members')
          .select('contact_id')
          .where('list_id', '=', list.id)
          .execute()
      ).map((row) => row.contact_id),
    ).toEqual([first.id]);
    // Both originals stay: the merged-away row is deleted, points at the kept one, and nothing points at it any more
    const original = await database.system
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', second.id)
      .executeTakeFirstOrThrow();
    expect(original.deleted_at).not.toBeNull();
    expect(original.merged_into_id).toBe(first.id);
    expect(original.name).toBe('anil  kumar');
    for (const table of ['tasks', 'tickets', 'activities', 'leads'] as const) {
      expect(
        await database.system.selectFrom(table).select('id').where('contact_id', '=', second.id).execute(),
      ).toEqual([]);
    }
    // The log has a line for each original, and the event is waiting for other modules
    const logKinds = (
      await database.system
        .selectFrom('activity_log')
        .select(['kind', 'record_id'])
        .where('account_id', '=', owner.businessId)
        .execute()
    ).filter((line) => line.kind.endsWith('merged') || line.kind.endsWith('merged_away'));
    expect(logKinds).toEqual(
      expect.arrayContaining([
        { kind: 'contacts.merged', record_id: first.id },
        { kind: 'contacts.merged_away', record_id: second.id },
      ]),
    );
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'contact.merged')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([{ keptId: first.id, mergedAwayId: second.id }]);
    // The pair is settled for good
    expect(await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a' }, 409)).toBe(
      'ALREADY_DECIDED',
    );
    expect(await runDetection(owner)).toBe(0);
  });

  it('refuses when both contacts have an open lead, and works once one is closed', async () => {
    const { owner, first, second, suggestion } = await businessWithTwinContacts();
    const firstLead = await owner.ok('POST', '/leads', { contactId: first.id }, 201);
    await owner.ok('POST', '/leads', { contactId: second.id }, 201);
    expect(await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a' }, 409)).toBe(
      'BOTH_HAVE_OPEN_LEADS',
    );
    const stages = await owner.ok('GET', '/pipeline');
    const lostStage = JSON.stringify(stages).match(/"id":"([^"]+)","name":"Lost"/)?.[1];
    expect(lostStage).toBeDefined();
    await owner.ok('POST', `/leads/${firstLead.id}/move`, { stageId: lostStage, lostReason: 'Too costly' });
    const result = await owner.ok('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a' });
    expect(result.object).toBe('contact');
    // The closed lead moved with its contact; only one lead is still open
    expect(
      await database.system.selectFrom('leads').select('id').where('contact_id', '=', result.keptId).execute(),
    ).toHaveLength(2);
  });

  it('refuses a choice that does not belong (400), a merge that would leave no phone or email (400), staff (403), signed out (401), another business (404)', async () => {
    const { owner, suggestion } = await businessWithTwinContacts();
    expect(
      await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a', take: { domain: 'a' } }, 400),
    ).toBe('INVALID_CHOICE');
    expect(
      await owner.refused(
        'POST',
        `/duplicates/${suggestion.id}/merge`,
        { keep: 'a', take: { custom: { nope: 'a' } } },
        400,
      ),
    ).toBe('INVALID_CHOICE');
    await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'c' }, 400);
    await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, {}, 400);
    await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a', extra: 1 }, 400);
    const staff = await addTeamMember(app, database, owner, { name: 'Sam Staff', role: 'staff' });
    await staff.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a' }, 403);
    expect(
      (await createPretendBrowser(app).send('POST', `/api/v1/duplicates/${suggestion.id}/merge`, { keep: 'a' }))
        .statusCode,
    ).toBe(401);
    const stranger = await signUpOwner(app, database);
    await stranger.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a' }, 404);
    await stranger.refused('POST', `/duplicates/${randomUUID()}/merge`, { keep: 'a' }, 404);
    // Nothing above changed anything
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toHaveLength(1);
  });

  it('refuses to leave a contact with neither phone nor email (400) and changes nothing', async () => {
    const owner = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/contacts', { name: 'Meera Rao', phone: '+971501111111' }, 201);
    const second = await owner.ok(
      'POST',
      '/contacts',
      { name: 'Meera Rao', email: 'meera.rao@example.com', phone: '+971501111112' },
      201,
    );
    await runDetection(owner);
    const [suggestion] = (await owner.ok('GET', '/duplicates?object=contact')).items;
    // After the pair was found, the second contact lost its phone (done straight in the database, as no route removes a phone)
    await database.system.updateTable('contacts').set({ phone: null }).where('id', '=', second.id).execute();
    const secondSide = suggestion.a.id === second.id ? 'a' : 'b';
    const firstSide = secondSide === 'a' ? 'b' : 'a';
    // Keep the second contact, with its (now empty) phone and the first contact's (empty) email: nothing left to reach them by
    expect(
      await owner.refused(
        'POST',
        `/duplicates/${suggestion.id}/merge`,
        { keep: secondSide, take: { phone: secondSide, email: firstSide } },
        400,
      ),
    ).toBe('CONTACT_NEEDS_PHONE_OR_EMAIL');
    expect((await owner.ok('GET', `/contacts/${first.id}`)).phone).toBe('+971501111111');
    expect((await owner.ok('GET', '/duplicates?object=contact')).items).toHaveLength(1);
  });
});

describe('POST /duplicates/{id}/merge: companies', () => {
  it('moves the people to the kept company and keeps both originals', async () => {
    const owner = await signUpOwner(app, database);
    const infosys = await owner.ok('POST', '/companies', { name: 'Infosys' }, 201);
    const infosysLtd = await owner.ok(
      'POST',
      '/companies',
      { name: 'Infosys Pvt Ltd', domain: 'infosys.example', city: 'Pune' },
      201,
    );
    const person = await owner.ok('POST', '/contacts', { name: 'Ravi Menon', phone: '+971502222222' }, 201);
    await owner.ok('PUT', `/contacts/${person.id}/company`, { companyId: infosysLtd.id });
    await runDetection(owner);
    const [suggestion] = (await owner.ok('GET', '/duplicates?object=company')).items;
    const keep = suggestion.a.id === infosys.id ? 'a' : 'b';
    const result = await owner.ok('POST', `/duplicates/${suggestion.id}/merge`, { keep, take: {} });
    expect(result).toEqual({ object: 'company', keptId: infosys.id, mergedAwayId: infosysLtd.id });
    expect(await owner.ok('GET', `/companies/${infosys.id}`)).toMatchObject({
      domain: 'infosys.example',
      city: 'Pune',
      contactCount: 1,
    });
    expect((await owner.ok('GET', `/contacts/${person.id}`)).companyId).toBe(infosys.id);
    const original = await database.system
      .selectFrom('companies')
      .selectAll()
      .where('id', '=', infosysLtd.id)
      .executeTakeFirstOrThrow();
    expect(original).toMatchObject({ merged_into_id: infosys.id, name: 'Infosys Pvt Ltd' });
    expect(original.deleted_at).not.toBeNull();
    await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a', take: { email: 'a' } }, 409);
  });

  it('refuses a choice that only a contact has (400)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Tata' }, 201);
    await owner.ok('POST', '/companies', { name: 'Tata Ltd' }, 201);
    await runDetection(owner);
    const [suggestion] = (await owner.ok('GET', '/duplicates?object=company')).items;
    expect(
      await owner.refused('POST', `/duplicates/${suggestion.id}/merge`, { keep: 'a', take: { email: 'a' } }, 400),
    ).toBe('INVALID_CHOICE');
  });
});
