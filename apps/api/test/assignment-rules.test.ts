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

/** Reads the sharing-out rule as the person (or as nobody). */
const getRules = (person: SignedInPerson | null) =>
  app.inject({ url: '/api/v1/assignment-rules', headers: person ? { cookie: person.cookieHeader } : {} });

/** Replaces the sharing-out rule as the person, with the headers the web app sends. */
const putRules = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/assignment-rules',
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Sends a request that changes something, as the person. */
const post = (person: SignedInPerson, url: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: payload as object,
  });

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

/** Adds a colleague to the person's business straight into the database (the team screens come with F02). */
async function addColleague(person: SignedInPerson): Promise<string> {
  const userId = randomUUID();
  await database.system
    .insertInto('users')
    .values({
      id: userId,
      account_id: person.profile.business.id,
      email: `colleague-${userId.slice(0, 8)}@example.com`,
      name: 'Rahul Kumar',
      mobile_e164: null,
      mobile_key: null,
      role: 'staff',
    })
    .execute();
  return userId;
}

/** Adds a contact and a lead for it (no owner named) and returns the lead's owner. */
async function addLeadAndReadOwner(person: SignedInPerson): Promise<string | null> {
  const contact = await post(person, '/contacts', {
    name: 'Priya',
    phone: `+9715${Math.floor(Math.random() * 90_000_000) + 10_000_000}`,
  });
  const lead = await post(person, '/leads', { contactId: contact.json().id });
  expect(lead.statusCode, lead.body).toBe(201);
  return lead.json().ownerUserId;
}

describe('GET /api/v1/assignment-rules', () => {
  it('starts as "every new lead goes to the person who signed up"', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await getRules(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ mode: 'one_person', userId: person.profile.user.id, roundRobinUserIds: [] });
  });

  it("never shows another business's rule", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    expect((await getRules(second)).json().userId).toBe(second.profile.user.id);
    expect((await getRules(first)).json().userId).toBe(first.profile.user.id);
  });

  it('answers 401 with nobody signed in and 403 to ordinary staff', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await getRules(null)).statusCode).toBe(401);
    await makeStaff(person);
    expect((await getRules(person)).statusCode).toBe(403);
  });
});

describe('PUT /api/v1/assignment-rules', () => {
  it('sets "every new lead goes to one person" and new leads go to that person', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const response = await putRules(person, { mode: 'one_person', userId: colleagueId });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ mode: 'one_person', userId: colleagueId, roundRobinUserIds: [] });
    expect(await addLeadAndReadOwner(person)).toBe(colleagueId);
    expect(await addLeadAndReadOwner(person)).toBe(colleagueId);
  });

  it('sets round-robin and keeps the order of the turns', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const turns = [colleagueId, person.profile.user.id];
    const response = await putRules(person, { mode: 'round_robin', userIds: turns });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ mode: 'round_robin', userId: null, roundRobinUserIds: turns });
    expect((await getRules(person)).json().roundRobinUserIds).toEqual(turns);
  });

  it('shares new leads evenly, in turn, and wraps round', async () => {
    const person = await createSignedInPerson(app, database);
    const firstColleague = await addColleague(person);
    const secondColleague = await addColleague(person);
    const turns = [person.profile.user.id, firstColleague, secondColleague];
    await putRules(person, { mode: 'round_robin', userIds: turns });

    const owners: Array<string | null> = [];
    for (let lead = 0; lead < 9; lead += 1) owners.push(await addLeadAndReadOwner(person));
    expect(owners).toEqual([...turns, ...turns, ...turns]);
  });

  it("does not use up anyone's turn when a lead is added with a named owner", async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const turns = [person.profile.user.id, colleagueId];
    await putRules(person, { mode: 'round_robin', userIds: turns });
    expect(await addLeadAndReadOwner(person)).toBe(turns[0]);
    const contact = await post(person, '/contacts', { name: 'Named', phone: '+971501110001' });
    const named = await post(person, '/leads', { contactId: contact.json().id, ownerUserId: turns[0] });
    expect(named.json().ownerUserId).toBe(turns[0]);
    expect(await addLeadAndReadOwner(person)).toBe(turns[1]);
  });

  it('does not use up a turn when adding the lead fails', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const turns = [person.profile.user.id, colleagueId];
    await putRules(person, { mode: 'round_robin', userIds: turns });
    const contact = await post(person, '/contacts', { name: 'Twice', phone: '+971501110002' });
    expect((await post(person, '/leads', { contactId: contact.json().id })).json().ownerUserId).toBe(turns[0]);
    // A second lead for the same contact is refused (it has an open lead): the failed attempt must not move the turn on
    expect((await post(person, '/leads', { contactId: contact.json().id })).statusCode).toBe(409);
    expect(await addLeadAndReadOwner(person)).toBe(turns[1]);
  });

  it('gives different people to leads added at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagues = [await addColleague(person), await addColleague(person), await addColleague(person)];
    const turns = [person.profile.user.id, ...colleagues];
    await putRules(person, { mode: 'round_robin', userIds: turns });
    const contactIds: string[] = [];
    for (let count = 0; count < 4; count += 1) {
      const contact = await post(person, '/contacts', { name: `Rush ${count}`, phone: `+97150222000${count}` });
      contactIds.push(contact.json().id);
    }
    const responses = await Promise.all(contactIds.map((contactId) => post(person, '/leads', { contactId })));
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201, 201]);
    const owners = responses.map((response) => response.json().ownerUserId);
    expect(new Set(owners).size).toBe(4);
  });

  it('starts a changed round-robin from its first person again', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    const turns = [person.profile.user.id, colleagueId];
    await putRules(person, { mode: 'round_robin', userIds: turns });
    await addLeadAndReadOwner(person);
    await putRules(person, { mode: 'round_robin', userIds: turns });
    expect(await addLeadAndReadOwner(person)).toBe(turns[0]);
  });

  it('can go back from round-robin to one person, and forgets the turn list', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    await putRules(person, { mode: 'round_robin', userIds: [person.profile.user.id, colleagueId] });
    const response = await putRules(person, { mode: 'one_person', userId: person.profile.user.id });
    expect(response.json()).toEqual({ mode: 'one_person', userId: person.profile.user.id, roundRobinUserIds: [] });
    expect(await addLeadAndReadOwner(person)).toBe(person.profile.user.id);
  });

  it('answers 404 for a person from another business or an unknown person, and keeps the old rule', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    for (const body of [
      { mode: 'one_person', userId: stranger.profile.user.id },
      { mode: 'one_person', userId: randomUUID() },
      { mode: 'round_robin', userIds: [person.profile.user.id, stranger.profile.user.id] },
    ]) {
      expect((await putRules(person, body)).statusCode, JSON.stringify(body)).toBe(404);
    }
    expect((await getRules(person)).json()).toEqual({
      mode: 'one_person',
      userId: person.profile.user.id,
      roundRobinUserIds: [],
    });
  });

  it('records who did it, with field names only', async () => {
    const person = await createSignedInPerson(app, database);
    const colleagueId = await addColleague(person);
    await putRules(person, { mode: 'round_robin', userIds: [person.profile.user.id, colleagueId] });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'assignment_rules.replaced')
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({ fields: ['mode', 'userIds'], actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'assignment_rules.changed')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ mode: 'round_robin' });
  });

  it('answers 401 with nobody signed in, 403 to staff and without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    const body = { mode: 'one_person', userId: person.profile.user.id };
    expect((await putRules(null, body)).statusCode).toBe(401);
    expect((await putRules(person, body, false)).statusCode).toBe(403);
    await makeStaff(person);
    expect((await putRules(person, body)).statusCode).toBe(403);
  });

  it('answers 400 for a missing or unknown mode, a missing or empty list, repeats, bad ids, or unknown fields', async () => {
    const person = await createSignedInPerson(app, database);
    const me = person.profile.user.id;
    const badBodies: unknown[] = [
      {},
      { mode: 'by_offering' },
      { mode: 'one_person' },
      { mode: 'one_person', userId: 'abc' },
      { mode: 'one_person', userId: me, userIds: [me] },
      { mode: 'round_robin' },
      { mode: 'round_robin', userIds: [] },
      { mode: 'round_robin', userIds: [me, me] },
      { mode: 'round_robin', userIds: ['abc'] },
      { mode: 'round_robin', userIds: [me], userId: me },
      { mode: 'round_robin', userIds: Array.from({ length: 51 }, () => randomUUID()) },
    ];
    for (const body of badBodies) {
      expect((await putRules(person, body)).statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
  });
});

describe('the database rules behind the sharing-out', () => {
  it('refuses a round-robin person from another business even if the app code is bypassed', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await expect(
      database.system
        .insertInto('assignment_rule_people')
        .values({
          account_id: person.profile.business.id,
          user_id: stranger.profile.user.id,
          sort: 0,
          created_by: null,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('refuses a rule that names a person from another business even if the app code is bypassed', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await expect(
      database.system
        .updateTable('assignment_rules')
        .set({ user_id: stranger.profile.user.id })
        .where('account_id', '=', person.profile.business.id)
        .execute(),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
