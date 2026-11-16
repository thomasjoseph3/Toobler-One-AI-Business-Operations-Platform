import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

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

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** Makes the person's business the given kind (its extra types depend on it). */
async function setIndustry(person: SignedInPerson, industry: string) {
  await database.system
    .updateTable('accounts')
    .set({ industry })
    .where('id', '=', person.profile.business.id)
    .execute();
}

/** Signs up a new business that is a plain "general business" (the test sign-up makes a hotel, which has extra types). */
async function newBusiness(): Promise<SignedInPerson> {
  const person = await createSignedInPerson(app, database);
  await setIndustry(person, 'general');
  return person;
}

/** A valid custom type, with anything in `changes` replacing the defaults. */
const customType = (changes: Record<string, unknown> = {}) => ({
  label: `Wedding enquiry ${randomUUID().slice(0, 6)}`,
  description: 'Wants to book a wedding or a large event.',
  examples: ['We want to host a wedding for 200 people.'],
  outcome: 'lead',
  ...changes,
});

describe('GET /api/v1/conversation-types', () => {
  it('gives a business its 13 system types the first time, in order, with the design defaults', async () => {
    const person = await newBusiness();
    const response = await send(person, 'GET', '/conversation-types');
    expect(response.statusCode, response.body).toBe(200);
    const { items } = response.json();
    expect(items).toHaveLength(13);
    expect(items.map((type: { key: string }) => type.key).slice(0, 4)).toEqual([
      'new_enquiry',
      'general_question',
      'existing_customer',
      'complaint',
    ]);
    expect(items.every((type: { isSystem: boolean }) => type.isSystem)).toBe(true);
    const complaint = items.find((type: { key: string }) => type.key === 'complaint');
    expect(complaint).toMatchObject({
      label: 'Complaint',
      outcome: 'ticket',
      ticketType: 'complaint',
      priority: 'high',
      needsPerson: true,
      alert: { who: 'manager', when: 'now' },
      playbook: 'service',
      isActive: true,
    });
    const newEnquiry = items.find((type: { key: string }) => type.key === 'new_enquiry');
    expect(newEnquiry).toMatchObject({ outcome: 'lead', ticketType: null, priority: null, alert: null });
  });

  it('adds the industry extras for a hotel, once, and a second read changes nothing', async () => {
    const person = await newBusiness();
    await setIndustry(person, 'hotel_resort');
    const first = (await send(person, 'GET', '/conversation-types')).json().items;
    const second = (await send(person, 'GET', '/conversation-types')).json().items;
    expect(first).toHaveLength(16);
    expect(first.find((type: { key: string }) => type.key === 'in_house_guest_request')).toMatchObject({
      isSystem: false,
      outcome: 'ticket',
      priority: 'urgent',
      alert: { who: 'front_desk', when: 'now' },
    });
    expect(second.map((type: { id: string }) => type.id)).toEqual(first.map((type: { id: string }) => type.id));
  });

  it('can be read by every role', async () => {
    const person = await newBusiness();
    await setRole(person, 'staff_own');
    expect((await send(person, 'GET', '/conversation-types')).statusCode).toBe(200);
  });

  it('keeps each business separate', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    await send(first, 'POST', '/conversation-types', customType({ label: 'Only for the first business' }));
    const firstList = (await send(first, 'GET', '/conversation-types')).json().items;
    const secondList = (await send(second, 'GET', '/conversation-types')).json().items;
    expect(firstList).toHaveLength(14);
    expect(secondList).toHaveLength(13);
    const firstIds = new Set(firstList.map((type: { id: string }) => type.id));
    expect(secondList.some((type: { id: string }) => firstIds.has(type.id))).toBe(false);
  });

  it('answers 401 when nobody is signed in', async () => {
    expect((await send(null, 'GET', '/conversation-types')).statusCode).toBe(401);
  });
});

describe('POST /api/v1/conversation-types', () => {
  it('adds a custom type at the end of the list, made from the label, switched on, not a system type', async () => {
    const person = await newBusiness();
    const response = await send(
      person,
      'POST',
      '/conversation-types',
      customType({ label: 'Wedding enquiry', needsPerson: true, alert: { who: 'owner', when: 'now' } }),
    );
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      key: 'wedding_enquiry',
      label: 'Wedding enquiry',
      isSystem: false,
      isActive: true,
      outcome: 'lead',
      ticketType: null,
      needsPerson: true,
      alert: { who: 'owner', when: 'now' },
      playbook: 'sales',
      sort: 13,
    });
    const list = (await send(person, 'GET', '/conversation-types')).json().items;
    expect(list).toHaveLength(14);
    expect(list.at(-1).key).toBe('wedding_enquiry');
  });

  it('adds a ticket type with its ticket kind and priority', async () => {
    const person = await newBusiness();
    const response = await send(
      person,
      'POST',
      '/conversation-types',
      customType({ label: 'Refund request', outcome: 'ticket', ticketType: 'question', priority: 'high' }),
    );
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      outcome: 'ticket',
      ticketType: 'question',
      priority: 'high',
      playbook: 'service',
    });
  });

  it('answers 409 when the name makes a key the business already uses, and adds nothing', async () => {
    const person = await newBusiness();
    const response = await send(person, 'POST', '/conversation-types', customType({ label: 'Complaint!' }));
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TYPE_EXISTS');
    const list = (await send(person, 'GET', '/conversation-types')).json().items;
    expect(list).toHaveLength(13);
  });

  it('answers 409 when the business already has 25 active types', async () => {
    const person = await newBusiness();
    // 13 system types, then 12 custom ones make 25
    for (let number = 1; number <= 12; number += 1) {
      const added = await send(person, 'POST', '/conversation-types', customType({ label: `Custom reason ${number}` }));
      expect(added.statusCode, added.body).toBe(201);
    }
    const response = await send(person, 'POST', '/conversation-types', customType({ label: 'One too many' }));
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TOO_MANY_TYPES');
  });

  it('never lets requests that arrive together push a business past 25 active types', async () => {
    const person = await newBusiness();
    // 13 system types leave room for 12; fifteen requests at the same moment fight for those places
    const answers = await Promise.all(
      Array.from({ length: 15 }, (_unused, number) =>
        send(person, 'POST', '/conversation-types', customType({ label: `Parallel reason ${number}` })),
      ),
    );
    const added = answers.filter((answer) => answer.statusCode === 201);
    const refused = answers.filter((answer) => answer.statusCode === 409);
    expect(added).toHaveLength(12);
    expect(refused).toHaveLength(3);
    expect(refused.every((answer) => answer.json().error.code === 'TOO_MANY_TYPES')).toBe(true);
    const list = (await send(person, 'GET', '/conversation-types')).json().items;
    expect(list.filter((type: { isActive: boolean }) => type.isActive)).toHaveLength(25);
  });

  it('is stopped by the database itself, not only by the service', async () => {
    const person = await newBusiness();
    await send(person, 'GET', '/conversation-types'); // gives the business its 13 starting types
    const insertType = (key: string) =>
      database.system
        .insertInto('conversation_types')
        .values({
          id: randomUUID(),
          account_id: person.profile.business.id,
          key,
          label: key,
          description: 'Added straight into the database',
          examples: '[]',
          outcome: 'log',
          ticket_type: null,
          priority: null,
          alert: null,
        })
        .execute();
    for (let number = 1; number <= 12; number += 1) await insertType(`direct_${number}`);
    await expect(insertType('direct_13')).rejects.toThrow(/too_many_active_conversation_types/);
  });

  it('answers 403 to staff who are not managers', async () => {
    const person = await newBusiness();
    await setRole(person, 'staff');
    expect((await send(person, 'POST', '/conversation-types', customType())).statusCode).toBe(403);
  });

  it('answers 401 when nobody is signed in, and 403 without the safety headers', async () => {
    expect((await send(null, 'POST', '/conversation-types', customType())).statusCode).toBe(401);
    const person = await newBusiness();
    expect((await send(person, 'POST', '/conversation-types', customType(), false)).statusCode).toBe(403);
  });

  it('answers 400 for bad input: a missing label, a ticket with no kind, a kind on a lead, too many examples, an unknown field', async () => {
    const person = await newBusiness();
    const bad = [
      customType({ label: '   ' }),
      customType({ outcome: 'ticket' }),
      customType({ ticketType: 'complaint', priority: 'high' }),
      customType({ outcome: 'bogus' }),
      customType({ examples: ['1', '2', '3', '4', '5', '6'] }),
      customType({ isSystem: true }),
      customType({ key: 'chosen_by_the_caller' }),
    ];
    for (const body of bad) {
      const response = await send(person, 'POST', '/conversation-types', body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await send(person, 'GET', '/conversation-types')).json().items).toHaveLength(13);
  });

  it('writes an activity-log line that names the type but holds none of its words', async () => {
    const person = await newBusiness();
    const created = await send(person, 'POST', '/conversation-types', customType({ label: 'Secret wording here' }));
    const typeId = created.json().id;
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'conversations.type_created')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).toContain(typeId);
    expect(JSON.stringify(lines[0])).not.toContain('Secret wording');
  });
});

/** Adds a custom type through the real route and returns it. */
async function addCustomType(person: SignedInPerson, changes: Record<string, unknown> = {}) {
  const response = await send(person, 'POST', '/conversation-types', customType(changes));
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

/** The business's types, as the list route shows them. */
async function readTypes(person: SignedInPerson) {
  return (await send(person, 'GET', '/conversation-types')).json().items as Array<{
    id: string;
    key: string;
    label: string;
    isActive: boolean;
    outcome: string;
    ticketType: string | null;
    priority: string | null;
  }>;
}

describe('PATCH /api/v1/conversation-types/{id}', () => {
  it('changes only the fields sent, and never the key', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person, { label: 'Wedding enquiry' });
    const response = await send(person, 'PATCH', `/conversation-types/${created.id}`, {
      label: 'Wedding or event',
      description: 'Wants a wedding or an event.',
      examples: ['A wedding for 80 guests'],
      needsPerson: true,
      alert: { who: 'manager', when: 'office_hours' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      key: 'wedding_enquiry',
      label: 'Wedding or event',
      description: 'Wants a wedding or an event.',
      examples: ['A wedding for 80 guests'],
      needsPerson: true,
      alert: { who: 'manager', when: 'office_hours' },
      outcome: 'lead',
      isActive: true,
    });
  });

  it('lets a manager rename and re-route a system type, and clear its alert with null', async () => {
    const person = await newBusiness();
    const complaint = (await readTypes(person)).find((type) => type.key === 'complaint');
    const response = await send(person, 'PATCH', `/conversation-types/${complaint!.id}`, {
      label: 'Problem',
      priority: 'urgent',
      alert: null,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      key: 'complaint',
      label: 'Problem',
      isSystem: true,
      outcome: 'ticket',
      ticketType: 'complaint',
      priority: 'urgent',
      alert: null,
    });
  });

  it('moves between a lead and a ticket: a ticket needs its kind and priority, and leaving a ticket clears them', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    // A lead cannot become a ticket without saying what kind
    const missing = await send(person, 'PATCH', `/conversation-types/${created.id}`, { outcome: 'ticket' });
    expect(missing.statusCode).toBe(400);
    const toTicket = await send(person, 'PATCH', `/conversation-types/${created.id}`, {
      outcome: 'ticket',
      ticketType: 'question',
      priority: 'high',
    });
    expect(toTicket.statusCode, toTicket.body).toBe(200);
    expect(toTicket.json()).toMatchObject({ outcome: 'ticket', ticketType: 'question', priority: 'high' });
    // A ticket's kind alone can change while it stays a ticket
    const newKind = await send(person, 'PATCH', `/conversation-types/${created.id}`, { ticketType: 'callback' });
    expect(newKind.json()).toMatchObject({ outcome: 'ticket', ticketType: 'callback', priority: 'high' });
    // Leaving a ticket clears the ticket fields
    const toLog = await send(person, 'PATCH', `/conversation-types/${created.id}`, { outcome: 'log' });
    expect(toLog.json()).toMatchObject({ outcome: 'log', ticketType: null, priority: null });
    // A ticket kind on a type that is not a ticket is refused
    const wrong = await send(person, 'PATCH', `/conversation-types/${created.id}`, { priority: 'high' });
    expect(wrong.statusCode).toBe(400);
  });

  it('switches a custom type off and on, but never a system type', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    const off = await send(person, 'PATCH', `/conversation-types/${created.id}`, { isActive: false });
    expect(off.json().isActive).toBe(false);
    const on = await send(person, 'PATCH', `/conversation-types/${created.id}`, { isActive: true });
    expect(on.json().isActive).toBe(true);
    const spam = (await readTypes(person)).find((type) => type.key === 'spam');
    const refused = await send(person, 'PATCH', `/conversation-types/${spam!.id}`, { isActive: false });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('SYSTEM_TYPE_ALWAYS_ON');
    expect((await readTypes(person)).find((type) => type.key === 'spam')!.isActive).toBe(true);
  });

  it('answers 409 when switching a type on would pass 25 active types', async () => {
    const person = await newBusiness();
    const first = await addCustomType(person, { label: 'Reason 0' });
    await send(person, 'PATCH', `/conversation-types/${first.id}`, { isActive: false });
    // 13 system types and 12 more custom ones make 25 active
    for (let number = 1; number <= 12; number += 1) await addCustomType(person, { label: `Reason ${number}` });
    const response = await send(person, 'PATCH', `/conversation-types/${first.id}`, { isActive: true });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TOO_MANY_TYPES');
  });

  it("answers 404 for an unknown type and for another business's type", async () => {
    const person = await newBusiness();
    const other = await newBusiness();
    const theirs = await addCustomType(other);
    expect((await send(person, 'PATCH', `/conversation-types/${randomUUID()}`, { label: 'Nope' })).statusCode).toBe(
      404,
    );
    expect((await send(person, 'PATCH', `/conversation-types/${theirs.id}`, { label: 'Hacked' })).statusCode).toBe(404);
    expect((await readTypes(other)).find((type) => type.id === theirs.id)!.label).toBe(theirs.label);
  });

  it('answers 403 to staff who are not managers, 401 to nobody, and 403 without the safety headers', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    expect((await send(null, 'PATCH', `/conversation-types/${created.id}`, { label: 'X' })).statusCode).toBe(401);
    expect((await send(person, 'PATCH', `/conversation-types/${created.id}`, { label: 'X' }, false)).statusCode).toBe(
      403,
    );
    await setRole(person, 'staff');
    expect((await send(person, 'PATCH', `/conversation-types/${created.id}`, { label: 'X' })).statusCode).toBe(403);
  });

  it('answers 400 for bad input: nothing to change, an unknown field, the key, a bad word, a blank label, too many examples', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    const bad = [
      {},
      { key: 'new_key' },
      { isSystem: false },
      { outcome: 'bogus' },
      { label: '   ' },
      { examples: ['1', '2', '3', '4', '5', '6'] },
      { alert: { who: 'nobody', when: 'now' } },
    ];
    for (const body of bad) {
      const response = await send(person, 'PATCH', `/conversation-types/${created.id}`, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await send(person, 'PATCH', '/conversation-types/not-a-uuid', { label: 'X' })).statusCode).toBe(400);
  });

  it('writes an activity-log line that names the fields but holds none of the words', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    await send(person, 'PATCH', `/conversation-types/${created.id}`, { label: 'Hidden words in a label' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'conversations.type_updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).toContain('label');
    expect(JSON.stringify(lines[0])).not.toContain('Hidden words');
  });
});

describe('DELETE /api/v1/conversation-types/{id}', () => {
  it('removes a custom type', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    const response = await send(person, 'DELETE', `/conversation-types/${created.id}`);
    expect(response.statusCode, response.body).toBe(204);
    expect((await readTypes(person)).some((type) => type.id === created.id)).toBe(false);
    // A second delete finds nothing
    expect((await send(person, 'DELETE', `/conversation-types/${created.id}`)).statusCode).toBe(404);
    // Its key is free again
    const again = await send(person, 'POST', '/conversation-types', customType({ label: created.label }));
    expect(again.statusCode, again.body).toBe(201);
  });

  it('never removes a system type, in the service or in the database', async () => {
    const person = await newBusiness();
    const complaint = (await readTypes(person)).find((type) => type.key === 'complaint');
    const response = await send(person, 'DELETE', `/conversation-types/${complaint!.id}`);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SYSTEM_TYPE_CANNOT_BE_REMOVED');
    expect((await readTypes(person)).some((type) => type.key === 'complaint')).toBe(true);
    // Straight at the database (even with full rights) the rule still holds
    await expect(
      database.system.deleteFrom('conversation_types').where('id', '=', complaint!.id).execute(),
    ).rejects.toThrow(/system_conversation_type_cannot_be_deleted/);
  });

  it("answers 404 for an unknown type and for another business's type, and changes nothing", async () => {
    const person = await newBusiness();
    const other = await newBusiness();
    const theirs = await addCustomType(other);
    expect((await send(person, 'DELETE', `/conversation-types/${randomUUID()}`)).statusCode).toBe(404);
    expect((await send(person, 'DELETE', `/conversation-types/${theirs.id}`)).statusCode).toBe(404);
    expect((await readTypes(other)).some((type) => type.id === theirs.id)).toBe(true);
  });

  it('answers 403 to staff who are not managers, 401 to nobody, 403 without the safety headers, and 400 for a bad id', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person);
    expect((await send(null, 'DELETE', `/conversation-types/${created.id}`)).statusCode).toBe(401);
    expect((await send(person, 'DELETE', `/conversation-types/${created.id}`, undefined, false)).statusCode).toBe(403);
    expect((await send(person, 'DELETE', '/conversation-types/not-a-uuid')).statusCode).toBe(400);
    await setRole(person, 'staff');
    expect((await send(person, 'DELETE', `/conversation-types/${created.id}`)).statusCode).toBe(403);
    expect((await readTypes(person)).some((type) => type.id === created.id)).toBe(true);
  });

  it('writes an activity-log line that names the type but none of its words', async () => {
    const person = await newBusiness();
    const created = await addCustomType(person, { label: 'Secret removed words' });
    await send(person, 'DELETE', `/conversation-types/${created.id}`);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'conversations.type_removed')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).toContain(created.id);
    expect(JSON.stringify(lines[0])).not.toContain('Secret removed');
  });
});
