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

/** Adds a contact as the person and returns its id. */
async function addContact(person: SignedInPerson, body: object): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/contacts',
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: body,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** Opens one contact. */
const getContact = (person: SignedInPerson | null, contactId: string) =>
  app.inject({ url: `/api/v1/contacts/${contactId}`, headers: person ? { cookie: person.cookieHeader } : {} });

/** Changes a contact as the person, with the headers the web app sends. */
const changeContact = (person: SignedInPerson | null, contactId: string, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/contacts/${contactId}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Marks a contact as deleted, the way the delete slice will. */
const markDeleted = (contactId: string) =>
  database.system.updateTable('contacts').set({ deleted_at: new Date() }).where('id', '=', contactId).execute();

describe('GET /api/v1/contacts/{id}', () => {
  it('opens one contact', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, {
      name: 'Priya Menon',
      phone: '098470 12345',
      email: 'priya@example.com',
    });
    const response = await getContact(person, contactId);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: contactId,
      name: 'Priya Menon',
      phone: '+919847012345',
      email: 'priya@example.com',
      lifecycleStage: 'new',
    });
  });

  it('answers 404 for an unknown id, a deleted contact and another business contact, and 400 for a malformed id', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    const strangerContactId = await addContact(stranger, { phone: uniqueUaeNumber() });
    expect((await getContact(person, randomUUID())).statusCode).toBe(404);
    expect((await getContact(person, strangerContactId)).statusCode).toBe(404);
    expect((await getContact(person, 'not-a-uuid')).statusCode).toBe(400);
    await markDeleted(contactId);
    expect((await getContact(person, contactId)).statusCode).toBe(404);
  });

  it('needs sign-in (401) and a verified email (403), and ordinary staff may read', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    expect((await getContact(null, contactId)).statusCode).toBe(401);
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await getContact(unverified, contactId)).json().error.code).toBe('EMAIL_NOT_VERIFIED');
    await database.system
      .updateTable('users')
      .set({ role: 'staff' })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await getContact(person, contactId)).statusCode).toBe(200);
  });
});

describe('PATCH /api/v1/contacts/{id}', () => {
  it('changes only the fields that were sent', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, {
      name: 'Priya',
      phone: '+91 98470 12345',
      email: 'priya@example.com',
      language: 'en',
    });
    const response = await changeContact(person, contactId, { name: 'Priya Menon', language: 'ML' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: contactId,
      name: 'Priya Menon',
      language: 'ml',
      phone: '+919847012345',
      email: 'priya@example.com',
    });
    expect((await getContact(person, contactId)).json().name).toBe('Priya Menon');
  });

  it('reads a new phone in any format, and a new email in any letter case', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: '+91 98470 12345' });
    const response = await changeContact(person, contactId, { phone: '0484 2345678', email: ' New@Example.COM ' });
    expect(response.json()).toMatchObject({ phone: '+914842345678', email: 'new@example.com' });
    const row = await database.system
      .selectFrom('contacts')
      .select('phone_key')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row.phone_key).toBe('914842345678');
  });

  it('clears a field with null or blank text, as long as a phone or an email is left', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, {
      name: 'Priya',
      phone: '+91 98470 12345',
      email: 'priya@example.com',
      language: 'en',
    });
    const cleared = await changeContact(person, contactId, { name: null, language: '', email: null });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json()).toMatchObject({ name: null, language: null, email: null, phone: '+919847012345' });
    const phoneCleared = await changeContact(person, contactId, { phone: null, email: 'back@example.com' });
    expect(phoneCleared.json()).toMatchObject({ phone: null, email: 'back@example.com' });
    const row = await database.system
      .selectFrom('contacts')
      .select('phone_key')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row.phone_key).toBeNull();
  });

  it('refuses to leave a contact with neither a phone nor an email (400 PHONE_OR_EMAIL_REQUIRED), and changes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { name: 'Priya', phone: '+91 98470 12345' });
    const response = await changeContact(person, contactId, { phone: null, name: 'Changed' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PHONE_OR_EMAIL_REQUIRED');
    expect((await getContact(person, contactId)).json()).toMatchObject({ name: 'Priya', phone: '+919847012345' });
  });

  it('refuses a phone or email another live contact has (409 naming that contact), but lets a contact keep its own', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await addContact(person, { phone: '+91 98470 12345', email: 'other@example.com' });
    const mine = await addContact(person, { phone: uniqueUaeNumber(), email: 'mine@example.com' });
    const phoneClash = await changeContact(person, mine, { phone: '098470 12345' });
    expect(phoneClash.statusCode).toBe(409);
    expect(phoneClash.json().error).toMatchObject({ code: 'CONTACT_EXISTS', details: { contactId: other } });
    const emailClash = await changeContact(person, mine, { email: 'OTHER@example.com' });
    expect(emailClash.statusCode).toBe(409);
    expect(emailClash.json().error.details.contactId).toBe(other);
    // Its own phone and email, typed differently, is not a clash
    expect((await changeContact(person, other, { phone: '9847012345', email: 'Other@Example.com' })).statusCode).toBe(
      200,
    );
  });

  it('changes nothing, and records nothing, when the values sent are the ones already stored', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { name: 'Priya', phone: '+91 98470 12345' });
    const before = await database.system
      .selectFrom('contacts')
      .select('updated_at')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    const response = await changeContact(person, contactId, { name: 'Priya', phone: '098470 12345' });
    expect(response.statusCode).toBe(200);
    const after = await database.system
      .selectFrom('contacts')
      .select('updated_at')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(after.updated_at).toEqual(before.updated_at);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', contactId)
      .where('kind', '=', 'contacts.updated')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('refuses an empty body, a bad phone, a bad email and any field it does not know (400)', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: '+91 98470 12345' });
    const empty = await changeContact(person, contactId, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('NOTHING_TO_CHANGE');
    const badPhone = await changeContact(person, contactId, { phone: '98470 12345 x123' });
    expect(badPhone.json().error.code).toBe('INVALID_PHONE');
    expect((await changeContact(person, contactId, { email: 'nope' })).statusCode).toBe(400);
    expect((await changeContact(person, contactId, { language: 'english' })).statusCode).toBe(400);
    for (const field of [
      { lifecycleStage: 'customer' },
      { accountId: randomUUID() },
      { createdBy: 'x' },
      { id: randomUUID() },
      { deletedAt: null },
    ]) {
      expect((await changeContact(person, contactId, { name: 'Ok', ...field })).statusCode, JSON.stringify(field)).toBe(
        400,
      );
    }
  });

  it('marks a contact as not a fit and takes the mark off again, and leaves other stages alone when unmarking', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    expect((await changeContact(person, contactId, { notAFit: true })).json().lifecycleStage).toBe('not_a_fit');
    expect((await changeContact(person, contactId, { notAFit: true })).json().lifecycleStage).toBe('not_a_fit');
    expect((await changeContact(person, contactId, { notAFit: false })).json().lifecycleStage).toBe('new');

    // A customer is not touched by "unmark": there was no mark to take off
    await database.system
      .updateTable('contacts')
      .set({ lifecycle_stage: 'customer' })
      .where('id', '=', contactId)
      .execute();
    const unmarked = await changeContact(person, contactId, { notAFit: false });
    expect(unmarked.statusCode).toBe(200);
    expect(unmarked.json().lifecycleStage).toBe('customer');
  });

  it('records who changed it, writes a log line and an event with field names only, and keeps who created it', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const contactId = await addContact(person, { name: 'Priya', phone: '+91 98470 12345' });
    await changeContact(person, contactId, { name: 'Secret Name', email: 'secret@example.com' });

    const row = await database.system
      .selectFrom('contacts')
      .select(['created_by', 'updated_by'])
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
    const logLines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'fields', 'record_id'])
      .where('account_id', '=', businessId)
      .where('kind', '=', 'contacts.updated')
      .execute();
    expect(logLines).toEqual([{ kind: 'contacts.updated', fields: ['name', 'email'], record_id: contactId }]);
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', businessId)
      .where('name', '=', 'contact.updated')
      .execute();
    expect(events).toEqual([{ payload: { contactId, fields: ['name', 'email'] } }]);
    expect(JSON.stringify([logLines, events])).not.toMatch(/Secret|secret@/);
  });

  it('answers 404 for an unknown id, a deleted contact and another business contact', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    const strangerContactId = await addContact(stranger, { phone: uniqueUaeNumber() });
    expect((await changeContact(person, randomUUID(), { name: 'x' })).statusCode).toBe(404);
    expect((await changeContact(person, strangerContactId, { name: 'Hijack' })).statusCode).toBe(404);
    expect((await getContact(stranger, strangerContactId)).json().name).toBeNull(); // untouched
    expect((await changeContact(person, 'not-a-uuid', { name: 'x' })).statusCode).toBe(400);
    await markDeleted(contactId);
    expect((await changeContact(person, contactId, { name: 'x' })).statusCode).toBe(404);
  });

  it('needs sign-in (401), a verified email (403) and our Origin and header (403); ordinary staff may edit', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    expect((await changeContact(null, contactId, { name: 'x' })).statusCode).toBe(401);
    expect((await changeContact(person, contactId, { name: 'x' }, false)).json().error.code).toBe('CSRF_REJECTED');
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await changeContact(unverified, contactId, { name: 'x' })).json().error.code).toBe('EMAIL_NOT_VERIFIED');
    await database.system
      .updateTable('users')
      .set({ role: 'staff' })
      .where('id', '=', person.profile.user.id)
      .execute();
    expect((await changeContact(person, contactId, { name: 'By staff' })).statusCode).toBe(200);
  });

  it('keeps both of two edits made at the same moment to different fields', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: '+91 98470 12345' });
    const [nameChange, emailChange] = await Promise.all([
      changeContact(person, contactId, { name: 'Priya Menon' }),
      changeContact(person, contactId, { email: 'priya@example.com' }),
    ]);
    expect(nameChange.statusCode).toBe(200);
    expect(emailChange.statusCode).toBe(200);
    expect((await getContact(person, contactId)).json()).toMatchObject({
      name: 'Priya Menon',
      email: 'priya@example.com',
    });
  });

  it('tells the loser of a true race for a phone 409 and not 500', async () => {
    // Another sign-in holds an UNCOMMITTED contact with the phone this edit wants. The edit's look-first check cannot see
    // it, so its update waits, and fails on the database's unique rule once the other one commits.
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    const wantedPhone = uniqueUaeNumber();
    const winnerId = randomUUID();
    let commitTheWinner: () => void = () => undefined;
    let winnerInserted: () => void = () => undefined;
    const insertedSignal = new Promise<void>((resolve) => (winnerInserted = resolve));
    const winnerTransaction = database.system.transaction().execute(async (transaction) => {
      await transaction
        .insertInto('contacts')
        .values({
          id: winnerId,
          account_id: person.profile.business.id,
          name: 'Winner',
          phone: wantedPhone,
          email: null,
          language: null,
          created_by: null,
          updated_by: null,
        })
        .execute();
      winnerInserted();
      await new Promise<void>((resolve) => (commitTheWinner = resolve));
    });
    await insertedSignal;

    const loserRequest = changeContact(person, contactId, { phone: wantedPhone });
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await database.system
        .selectFrom('pg_stat_activity' as never)
        .select((expression) => expression.fn.countAll<string>().as('waiting'))
        .where('wait_event_type' as never, '=', 'Lock' as never)
        .executeTakeFirstOrThrow();
      if (Number((waiting as { waiting: string }).waiting) > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    commitTheWinner();
    await winnerTransaction;

    const loser = await loserRequest;
    expect(loser.statusCode, loser.body).toBe(409);
    expect(loser.json().error).toMatchObject({ code: 'CONTACT_EXISTS', details: { contactId: winnerId } });
  });
});
