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
  method: 'GET' | 'POST',
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
