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

/** Deletes a contact as the person, with the headers the web app sends. */
const deleteContact = (person: SignedInPerson | null, contactId: string, withCsrfHeaders = true) =>
  app.inject({
    method: 'DELETE',
    url: `/api/v1/contacts/${contactId}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
  });

/** Opens one contact. */
const getContact = (person: SignedInPerson, contactId: string) =>
  app.inject({ url: `/api/v1/contacts/${contactId}`, headers: { cookie: person.cookieHeader } });

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

describe('DELETE /api/v1/contacts/{id}', () => {
  it('deletes the contact: it answers 204, vanishes from every route, but its row and data stay', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, {
      name: 'Priya Menon',
      phone: '098470 12345',
      email: 'priya@example.com',
    });
    const response = await deleteContact(person, contactId);
    expect(response.statusCode, response.body).toBe(204);
    expect(response.body).toBe('');

    expect((await getContact(person, contactId)).statusCode).toBe(404);
    const list = await app.inject({ url: '/api/v1/contacts', headers: { cookie: person.cookieHeader } });
    expect(list.json()).toMatchObject({ items: [], total: 0 });
    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contacts/${contactId}`,
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
      payload: { name: 'Back from the dead' },
    });
    expect(edit.statusCode).toBe(404);

    const row = await database.system
      .selectFrom('contacts')
      .select(['name', 'phone', 'email', 'deleted_at', 'updated_by'])
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ name: 'Priya Menon', phone: '+919847012345', email: 'priya@example.com' });
    expect(row.deleted_at).not.toBeNull();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 404 when it is deleted a second time', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    expect((await deleteContact(person, contactId)).statusCode).toBe(204);
    expect((await deleteContact(person, contactId)).statusCode).toBe(404);
  });

  it('frees the phone and the email for a new contact', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: '+91 98470 12345', email: 'priya@example.com' });
    await deleteContact(person, contactId);
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
      payload: { phone: '098470 12345', email: 'priya@example.com' },
    });
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json().id).not.toBe(contactId);
  });

  it('is for managers only: ordinary staff get 403 and the contact stays', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    await database.system
      .updateTable('users')
      .set({ role: 'staff' })
      .where('id', '=', person.profile.user.id)
      .execute();
    const response = await deleteContact(person, contactId);
    expect(response.statusCode).toBe(403);
    expect((await getContact(person, contactId)).statusCode).toBe(200);
  });

  it('needs sign-in (401), a verified email (403) and our Origin and header (403)', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    expect((await deleteContact(null, contactId)).statusCode).toBe(401);
    expect((await deleteContact(person, contactId, false)).json().error.code).toBe('CSRF_REJECTED');
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await deleteContact(unverified, contactId)).json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await getContact(person, contactId)).statusCode).toBe(200); // nothing was deleted
  });

  it('answers 404 for an unknown id and for another business contact (which stays), and 400 for a malformed id', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const strangerContactId = await addContact(stranger, { phone: uniqueUaeNumber() });
    expect((await deleteContact(person, randomUUID())).statusCode).toBe(404);
    expect((await deleteContact(person, strangerContactId)).statusCode).toBe(404);
    expect((await getContact(stranger, strangerContactId)).statusCode).toBe(200);
    expect((await deleteContact(person, 'not-a-uuid')).statusCode).toBe(400);
  });

  it('writes a log line and an event with the contact id only, never its phone or email', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const contactId = await addContact(person, {
      name: 'Secret Name',
      phone: '098470 12345',
      email: 'secret@example.com',
    });
    await deleteContact(person, contactId);

    const logLines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'record_type', 'record_id', 'actor'])
      .where('account_id', '=', businessId)
      .where('kind', '=', 'contacts.deleted')
      .execute();
    expect(logLines).toEqual([
      {
        kind: 'contacts.deleted',
        record_type: 'contact',
        record_id: contactId,
        actor: { kind: 'user', id: person.profile.user.id },
      },
    ]);
    const events = await database.system
      .selectFrom('domain_events')
      .select(['name', 'payload'])
      .where('account_id', '=', businessId)
      .where('name', '=', 'contact.deleted')
      .execute();
    expect(events).toEqual([{ name: 'contact.deleted', payload: { contactId } }]);
    expect(JSON.stringify([logLines, events])).not.toMatch(/Secret|secret@|9847012345/);
  });

  it('lets exactly one of two deletes at the same moment succeed', async () => {
    const person = await createSignedInPerson(app, database);
    const contactId = await addContact(person, { phone: uniqueUaeNumber() });
    const results = await Promise.all([deleteContact(person, contactId), deleteContact(person, contactId)]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 404]);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('record_id', '=', contactId)
      .where('kind', '=', 'contacts.deleted')
      .execute();
    expect(lines).toHaveLength(1);
  });

  it("leaves the other contacts of the business, and every other business's contacts, alone", async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const gone = await addContact(person, { phone: uniqueUaeNumber() });
    const kept = await addContact(person, { phone: uniqueUaeNumber() });
    const strangerKept = await addContact(stranger, { phone: uniqueUaeNumber() });
    await deleteContact(person, gone);
    expect((await getContact(person, kept)).statusCode).toBe(200);
    expect((await getContact(stranger, strangerKept)).statusCode).toBe(200);
  });
});
