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

/** Adds a contact as the person, with the headers the web app sends. */
const addContact = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/contacts',
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Lists contacts as the person. `query` is the part after the `?`. */
const listContacts = (person: SignedInPerson | null, query = '') =>
  app.inject({
    url: `/api/v1/contacts${query ? `?${query}` : ''}`,
    headers: person ? { cookie: person.cookieHeader } : {},
  });

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

describe('POST /api/v1/contacts', () => {
  it('adds a contact, stores the phone in international form, and starts it as new', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addContact(person, {
      name: 'Priya Menon',
      phone: '098470 12345',
      email: 'Priya@Example.com',
      language: 'ML',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Priya Menon',
      phone: '+919847012345',
      email: 'priya@example.com',
      language: 'ml',
      lifecycleStage: 'new',
    });
    expect(response.json().id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(response.json()).sort()).toEqual(
      ['createdAt', 'email', 'id', 'language', 'lifecycleStage', 'name', 'phone', 'updatedAt'].sort(),
    );
  });

  it('accepts a phone only, an email only, and treats blank text as not given', async () => {
    const person = await createSignedInPerson(app, database);
    const phoneOnly = await addContact(person, { phone: uniqueUaeNumber(), name: '', email: '  ' });
    expect(phoneOnly.statusCode, phoneOnly.body).toBe(201);
    expect(phoneOnly.json()).toMatchObject({ name: null, email: null });
    const emailOnly = await addContact(person, { email: `only-${randomUUID().slice(0, 8)}@example.com` });
    expect(emailOnly.statusCode).toBe(201);
    expect(emailOnly.json().phone).toBeNull();
  });

  it('reads numbers of other countries, and keeps a UK and an Indian number with the same last digits apart', async () => {
    const person = await createSignedInPerson(app, database);
    const british = await addContact(person, { phone: '+44 7700 900123' });
    const indian = await addContact(person, { phone: '+91 77009 00123' });
    expect(british.statusCode, british.body).toBe(201);
    expect(british.json().phone).toBe('+447700900123');
    expect(indian.statusCode, indian.body).toBe(201);
    expect(indian.json().phone).toBe('+917700900123');
  });

  it('refuses a second contact with the same phone in any format (409 CONTACT_EXISTS naming the first)', async () => {
    const person = await createSignedInPerson(app, database);
    const first = await addContact(person, { name: 'Priya', phone: '098470 12345' });
    for (const sameNumber of [
      '+91 98470-12345',
      '9847012345',
      '0091 98470 12345',
      '919847012345',
      '(+91) 98470.12345',
    ]) {
      const response = await addContact(person, { name: 'Someone else', phone: sameNumber });
      expect(response.statusCode, sameNumber).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'CONTACT_EXISTS', details: { contactId: first.json().id } });
    }
  });

  it('refuses a second contact with the same email, whatever the letter case', async () => {
    const person = await createSignedInPerson(app, database);
    const first = await addContact(person, { email: 'priya@example.com' });
    const response = await addContact(person, { email: ' PRIYA@Example.COM ' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.details).toEqual({ contactId: first.json().id });
  });

  it('names the phone match when the phone and the email match two different contacts', async () => {
    const person = await createSignedInPerson(app, database);
    const byPhone = await addContact(person, { phone: '+91 98470 12345' });
    const byEmail = await addContact(person, { email: 'anita@example.com' });
    const response = await addContact(person, { phone: '9847012345', email: 'anita@example.com' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.details.contactId).toBe(byPhone.json().id);
    expect(response.json().error.details.contactId).not.toBe(byEmail.json().id);
  });

  it('lets only one of ten requests at the same moment win, and every loser is told who won', async () => {
    const person = await createSignedInPerson(app, database);
    const phone = uniqueUaeNumber();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_unused, index) => addContact(person, { phone, name: `Request ${index}` })),
    );
    const winners = results.filter((result) => result.statusCode === 201);
    const losers = results.filter((result) => result.statusCode === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9); // none of them a 500
    for (const loser of losers) expect(loser.json().error.details.contactId).toBe(winners[0]!.json().id);
    const stored = await database.system
      .selectFrom('contacts')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(stored).toHaveLength(1);
  });

  it('tells the loser of a true race 409 and not 500, even when its own look-first check found nothing', async () => {
    // Another sign-in holds an UNCOMMITTED contact with this phone. The request's look-first check cannot see it, so its
    // insert has to wait for it, and fails on the database's unique rule once the other one commits.
    const person = await createSignedInPerson(app, database);
    const phone = uniqueUaeNumber();
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
          phone,
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

    const loserRequest = addContact(person, { phone, name: 'Loser' });
    // Wait until the loser's insert is really stuck waiting for the winner's row
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

  it('lets two different businesses hold the same phone, and lets a number be used again after its contact is deleted', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const phone = uniqueUaeNumber();
    const original = await addContact(first, { phone });
    expect((await addContact(second, { phone })).statusCode).toBe(201);

    await database.system
      .updateTable('contacts')
      .set({ deleted_at: new Date() })
      .where('id', '=', original.json().id)
      .execute();
    const again = await addContact(first, { phone });
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json().id).not.toBe(original.json().id);
  });

  it('needs a phone or an email (400 PHONE_OR_EMAIL_REQUIRED)', async () => {
    const person = await createSignedInPerson(app, database);
    for (const body of [{}, { name: 'Only a name' }, { name: 'Blank', phone: '', email: '' }]) {
      const response = await addContact(person, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json().error.code).toBe('PHONE_OR_EMAIL_REQUIRED');
    }
  });

  it('refuses a phone that cannot be a phone number, or has an extension (400 INVALID_PHONE)', async () => {
    const person = await createSignedInPerson(app, database);
    for (const phone of ['abc', '12345', '98470 12345 x123', '+91 12']) {
      const response = await addContact(person, { phone });
      expect(response.statusCode, phone).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PHONE');
    }
  });

  it('refuses a bad email, a bad language, a too long name, and any field it does not know (400)', async () => {
    const person = await createSignedInPerson(app, database);
    const phone = uniqueUaeNumber();
    expect((await addContact(person, { phone, email: 'not-an-email' })).statusCode).toBe(400);
    expect((await addContact(person, { phone, language: 'english' })).statusCode).toBe(400);
    expect((await addContact(person, { phone, name: 'x'.repeat(121) })).statusCode).toBe(400);
    expect((await addContact(person, { phone, lifecycleStage: 'customer' })).statusCode).toBe(400);
    expect((await addContact(person, { phone, accountId: randomUUID() })).statusCode).toBe(400);
    expect((await addContact(person, { phone, createdBy: 'someone' })).statusCode).toBe(400);
  });

  it('needs sign-in (401), a verified email (403) and our Origin and header (403); ordinary staff may add', async () => {
    const person = await createSignedInPerson(app, database);
    const body = { phone: uniqueUaeNumber() };
    expect((await addContact(null, body)).statusCode).toBe(401);
    expect((await addContact(person, body, false)).json().error.code).toBe('CSRF_REJECTED');
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await addContact(unverified, body)).json().error.code).toBe('EMAIL_NOT_VERIFIED');
    await makeStaff(person);
    expect((await addContact(person, body)).statusCode).toBe(201);
  });

  it('records who added it, writes an activity-log line with field names only, and an event with ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const response = await addContact(person, {
      name: 'Priya Menon',
      phone: '098470 12345',
      email: 'priya@example.com',
    });
    const contactId = response.json().id;

    const row = await database.system
      .selectFrom('contacts')
      .select(['created_by', 'updated_by', 'account_id', 'phone_key'])
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.account_id).toBe(businessId);
    expect(row.phone_key).toBe('919847012345');

    const logLines = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'record_type', 'record_id', 'fields', 'actor'])
      .where('account_id', '=', businessId)
      .where('kind', '=', 'contacts.created')
      .execute();
    expect(logLines).toEqual([
      {
        kind: 'contacts.created',
        record_type: 'contact',
        record_id: contactId,
        fields: ['name', 'phone', 'email'],
        actor: { kind: 'user', id: person.profile.user.id },
      },
    ]);
    const events = await database.system
      .selectFrom('domain_events')
      .select(['name', 'payload'])
      .where('account_id', '=', businessId)
      .where('name', '=', 'contact.created')
      .execute();
    expect(events).toEqual([{ name: 'contact.created', payload: { contactId } }]);
    const everythingWritten = JSON.stringify([logLines, events]);
    expect(everythingWritten).not.toContain('9847012345');
    expect(everythingWritten).not.toContain('priya@example.com');
    expect(everythingWritten).not.toContain('Priya');
  });
});

describe('GET /api/v1/contacts', () => {
  /** Adds several contacts and returns their ids, oldest first. */
  async function addSeveral(person: SignedInPerson, bodies: object[]): Promise<string[]> {
    const ids: string[] = [];
    for (const body of bodies) {
      const response = await addContact(person, body);
      expect(response.statusCode, response.body).toBe(201);
      ids.push(response.json().id);
    }
    return ids;
  }

  it('lists the business contacts, newest change first, with the total, page and limit', async () => {
    const person = await createSignedInPerson(app, database);
    const [first, second, third] = await addSeveral(person, [
      { name: 'One', email: 'one@example.com' },
      { name: 'Two', email: 'two@example.com' },
      { name: 'Three', email: 'three@example.com' },
    ]);
    const response = await listContacts(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ total: 3, page: 1, limit: 25 });
    expect(response.json().items.map((item: { id: string }) => item.id)).toEqual([third, second, first]);
  });

  it('pages through the list, and refuses a page or limit that makes no sense (400)', async () => {
    const person = await createSignedInPerson(app, database);
    const ids = await addSeveral(
      person,
      [1, 2, 3, 4, 5].map((number) => ({ name: `Person ${number}`, email: `p${number}@example.com` })),
    );
    const firstPage = (await listContacts(person, 'limit=2&page=1')).json();
    const secondPage = (await listContacts(person, 'limit=2&page=2')).json();
    const thirdPage = (await listContacts(person, 'limit=2&page=3')).json();
    expect(firstPage.total).toBe(5);
    expect(
      [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((item: { id: string }) => item.id),
    ).toEqual([...ids].reverse());
    expect(thirdPage.items).toHaveLength(1);
    expect((await listContacts(person, 'limit=500')).statusCode).toBe(400);
    expect((await listContacts(person, 'limit=0')).statusCode).toBe(400);
    expect((await listContacts(person, 'page=0')).statusCode).toBe(400);
    expect((await listContacts(person, 'lifecycleStage=vip')).statusCode).toBe(400);
  });

  it('searches names and emails without caring about letter case', async () => {
    const person = await createSignedInPerson(app, database);
    const [priya] = await addSeveral(person, [
      { name: 'Priya Menon', email: 'priya@example.com' },
      { name: 'Anita Nair', email: 'anita@shop.in' },
    ]);
    expect((await listContacts(person, 'q=PRIYA')).json().items.map((item: { id: string }) => item.id)).toEqual([
      priya,
    ]);
    expect((await listContacts(person, 'q=@shop.in')).json().total).toBe(1);
    expect((await listContacts(person, 'q=nobody')).json()).toMatchObject({ items: [], total: 0 });
  });

  it('finds a contact by its phone in any way the number is typed', async () => {
    const person = await createSignedInPerson(app, database);
    const [indian] = await addSeveral(person, [{ phone: '+91 98470 12345' }, { phone: '+44 7700 900123' }]);
    for (const typed of ['98470 12345', '098470-12345', '+91 98470', '84701', '9198470']) {
      const response = await listContacts(person, `q=${encodeURIComponent(typed)}`);
      expect(
        response.json().items.map((item: { id: string }) => item.id),
        typed,
      ).toEqual([indian]);
    }
    expect((await listContacts(person, `q=${encodeURIComponent('+44 7700')}`)).json().total).toBe(1);
  });

  it('searches % and _ as ordinary characters, and treats a blank search as no search', async () => {
    const person = await createSignedInPerson(app, database);
    await addSeveral(person, [
      { name: '50% Off Co', email: 'a@example.com' },
      { name: 'Plain Name', email: 'b@example.com' },
    ]);
    expect((await listContacts(person, 'q=%25')).json().total).toBe(1);
    expect((await listContacts(person, 'q=_')).json().total).toBe(0);
    expect((await listContacts(person, 'q=%20%20')).json().total).toBe(2);
  });

  it('filters by lifecycle stage', async () => {
    const person = await createSignedInPerson(app, database);
    const [first] = await addSeveral(person, [
      { name: 'Spam', email: 'spam@example.com' },
      { name: 'Real', email: 'real@example.com' },
    ]);
    await database.system
      .updateTable('contacts')
      .set({ lifecycle_stage: 'not_a_fit' })
      .where('id', '=', first!)
      .execute();
    expect(
      (await listContacts(person, 'lifecycleStage=not_a_fit')).json().items.map((item: { id: string }) => item.id),
    ).toEqual([first]);
    expect((await listContacts(person, 'lifecycleStage=new')).json().total).toBe(1);
  });

  it('never shows a deleted contact, and never shows another business its contacts', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const [deleted] = await addSeveral(first, [
      { name: 'Gone', email: 'gone@example.com' },
      { name: 'Here', email: 'here@example.com' },
    ]);
    await addSeveral(second, [{ name: 'Theirs', email: 'theirs@example.com' }]);
    await database.system.updateTable('contacts').set({ deleted_at: new Date() }).where('id', '=', deleted!).execute();

    const firstList = (await listContacts(first)).json();
    expect(firstList.items.map((item: { name: string }) => item.name)).toEqual(['Here']);
    expect(firstList.total).toBe(1);
    expect((await listContacts(second)).json().items.map((item: { name: string }) => item.name)).toEqual(['Theirs']);
  });

  it('needs sign-in (401) and a verified email (403), and ordinary staff may read', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listContacts(null)).statusCode).toBe(401);
    const unverified = await createSignedInPerson(app, database, { verified: false });
    expect((await listContacts(unverified)).json().error.code).toBe('EMAIL_NOT_VERIFIED');
    await makeStaff(person);
    expect((await listContacts(person)).statusCode).toBe(200);
  });
});

describe('the database protects contacts', () => {
  it('lets the app role add and edit contacts but never delete one, or change who made it or which business it belongs to', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const contactId = (await addContact(person, { phone: uniqueUaeNumber(), name: 'Before' })).json().id;

    await database.runInAccountTransaction(businessId, (transaction) =>
      transaction.updateTable('contacts').set({ name: 'After' }).where('id', '=', contactId).execute(),
    );
    const edited = await database.system
      .selectFrom('contacts')
      .select('name')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(edited.name).toBe('After');

    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction.deleteFrom('contacts').where('id', '=', contactId).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction.updateTable('contacts').set({ account_id: randomUUID() }).where('id', '=', contactId).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(businessId, (transaction) =>
        transaction
          .updateTable('contacts')
          .set({ created_by: { kind: 'user', id: 'x' } })
          .where('id', '=', contactId)
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a contact with no phone and no email, a stored phone that is not international, and an uppercase email', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const insert = (values: { phone?: string | null; email?: string | null }) =>
      database.system
        .insertInto('contacts')
        .values({
          id: randomUUID(),
          account_id: businessId,
          name: 'x',
          phone: null,
          email: null,
          language: null,
          deleted_at: null,
          created_by: null,
          updated_by: null,
          ...values,
        })
        .execute();
    await expect(insert({})).rejects.toThrow(/contacts_needs_phone_or_email/);
    await expect(insert({ phone: '09847012345' })).rejects.toThrow(/check constraint/i);
    await expect(insert({ email: 'Upper@Example.com' })).rejects.toThrow(/check constraint/i);
  });

  it('keeps phone_key in step with the phone by itself, and refuses two live contacts with the same phone or email even from the database', async () => {
    const person = await createSignedInPerson(app, database);
    const businessId = person.profile.business.id;
    const phone = uniqueUaeNumber();
    const contactId = (await addContact(person, { phone })).json().id;
    const row = await database.system
      .selectFrom('contacts')
      .select('phone_key')
      .where('id', '=', contactId)
      .executeTakeFirstOrThrow();
    expect(row.phone_key).toBe(phone.slice(1));

    const insert = (values: { phone?: string | null; email?: string | null }) =>
      database.system
        .insertInto('contacts')
        .values({
          id: randomUUID(),
          account_id: businessId,
          name: 'x',
          phone: null,
          email: null,
          language: null,
          deleted_at: null,
          created_by: null,
          updated_by: null,
          ...values,
        })
        .execute();
    await expect(insert({ phone })).rejects.toThrow(/contacts_phone_unique/);
    const email = `dup-${randomUUID().slice(0, 8)}@example.com`;
    await addContact(person, { email });
    await expect(insert({ email })).rejects.toThrow(/contacts_email_unique/);
  });
});
