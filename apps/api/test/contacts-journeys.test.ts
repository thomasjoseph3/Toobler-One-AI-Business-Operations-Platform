import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// Journey tests for contacts: whole stories told as one route after another, in pretend browsers that keep cookies like
// real ones. The other contact tests check one route at a time; these check that add, find, edit, filter, delete and the
// fence between businesses all work TOGETHER.

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

interface Person {
  browser: PretendBrowser;
  userId: string;
  businessId: string;
}

/** Signs a new owner up and in, and gives them a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

/** Adds a contact and returns the whole response. */
const addContact = (person: Person, body: object) => person.browser.send('POST', '/api/v1/contacts', body);

/** The contacts the person's list shows for a search or filter, as the list route answers them. */
async function listContacts(person: Person, queryString = '') {
  const response = await person.browser.send('GET', `/api/v1/contacts${queryString}`);
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as { items: { id: string; lifecycleStage: string }[]; total: number };
}

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

describe('journey: the life of one contact', () => {
  it('add → find by other phone formats → duplicate → edit → not a fit → filter → unmark → delete → number reusable', async () => {
    const owner = await signUpAndSignIn();
    const phone = uniqueUaeNumber();
    const digitsOnly = phone.slice(1);

    // Add a contact; the phone is read into its one international form, and it starts as "new"
    const created = await addContact(owner, { name: 'Priya Menon', phone: `${phone.slice(0, 4)} ${phone.slice(4)}` });
    expect(created.statusCode, created.body).toBe(201);
    const contactId = created.json().id as string;
    expect(created.json()).toMatchObject({ phone, lifecycleStage: 'new' });

    // The same number typed another way finds the same single contact
    for (const typed of [phone, digitsOnly]) {
      const found = await listContacts(owner, `?q=${encodeURIComponent(typed)}`);
      expect(found.items.map((item) => item.id)).toEqual([contactId]);
    }

    // Adding the same person again, with the number typed differently, is refused and names the first contact
    const duplicate = await addContact(owner, { name: 'Priya again', phone: `${phone.slice(0, 4)}-${phone.slice(4)}` });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({ code: 'CONTACT_EXISTS', details: { contactId } });
    expect((await listContacts(owner)).total).toBe(1);

    // Edit: a new name and an email; reading it back shows both
    const edited = await owner.browser.send('PATCH', `/api/v1/contacts/${contactId}`, {
      name: 'Priya Nair',
      email: 'Priya@Example.com',
    });
    expect(edited.statusCode, edited.body).toBe(200);
    const opened = await owner.browser.send('GET', `/api/v1/contacts/${contactId}`);
    expect(opened.json()).toMatchObject({ name: 'Priya Nair', email: 'priya@example.com', phone });

    // Mark as not a fit: the filter finds it, and the "new" filter no longer does
    const marked = await owner.browser.send('PATCH', `/api/v1/contacts/${contactId}`, { notAFit: true });
    expect(marked.json().lifecycleStage).toBe('not_a_fit');
    expect((await listContacts(owner, '?lifecycleStage=not_a_fit')).items.map((item) => item.id)).toEqual([contactId]);
    expect((await listContacts(owner, '?lifecycleStage=new')).total).toBe(0);

    // Unmark: back to "new"
    const unmarked = await owner.browser.send('PATCH', `/api/v1/contacts/${contactId}`, { notAFit: false });
    expect(unmarked.json().lifecycleStage).toBe('new');
    expect((await listContacts(owner, '?lifecycleStage=new')).items.map((item) => item.id)).toEqual([contactId]);

    // Delete: gone from the list, the search, the detail and further edits; a second delete is a 404
    expect((await owner.browser.send('DELETE', `/api/v1/contacts/${contactId}`)).statusCode).toBe(204);
    expect((await listContacts(owner)).total).toBe(0);
    expect((await listContacts(owner, `?q=${encodeURIComponent(phone)}`)).total).toBe(0);
    expect((await owner.browser.send('GET', `/api/v1/contacts/${contactId}`)).statusCode).toBe(404);
    expect((await owner.browser.send('PATCH', `/api/v1/contacts/${contactId}`, { name: 'Ghost' })).statusCode).toBe(
      404,
    );
    expect((await owner.browser.send('DELETE', `/api/v1/contacts/${contactId}`)).statusCode).toBe(404);

    // The number is free again: a new contact gets it, with a new id
    const again = await addContact(owner, { name: 'Priya, back again', phone });
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json().id).not.toBe(contactId);

    // Every step left a trail in the activity log, in the business's name
    const logKinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', owner.businessId)
      .where('kind', 'like', 'contacts.%')
      .execute();
    expect(new Set(logKinds.map((line) => line.kind))).toEqual(
      new Set(['contacts.created', 'contacts.updated', 'contacts.deleted']),
    );
  });
});

describe('journey: two businesses side by side', () => {
  it("one business cannot see, change or delete the other's contact, but can use the same number", async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const phone = uniqueUaeNumber();

    const created = await addContact(first, { name: 'Only for the first business', phone });
    const contactId = created.json().id as string;

    // The second business gets 404 on every route that names the first one's contact, and its list is empty
    expect((await second.browser.send('GET', `/api/v1/contacts/${contactId}`)).statusCode).toBe(404);
    expect(
      (await second.browser.send('PATCH', `/api/v1/contacts/${contactId}`, { name: 'Taken over' })).statusCode,
    ).toBe(404);
    expect((await second.browser.send('DELETE', `/api/v1/contacts/${contactId}`)).statusCode).toBe(404);
    expect((await listContacts(second)).total).toBe(0);
    expect((await listContacts(second, `?q=${encodeURIComponent(phone)}`)).total).toBe(0);

    // Nothing changed for the first business
    const stillThere = await first.browser.send('GET', `/api/v1/contacts/${contactId}`);
    expect(stillThere.json()).toMatchObject({ name: 'Only for the first business', phone });

    // The same number in the second business is no clash: it is a different contact in a different business
    const secondCreated = await addContact(second, { name: 'Same number, other business', phone });
    expect(secondCreated.statusCode, secondCreated.body).toBe(201);
    expect(secondCreated.json().id).not.toBe(contactId);
    expect((await listContacts(first)).items.map((item) => item.id)).toEqual([contactId]);
    expect((await listContacts(second)).items.map((item) => item.id)).toEqual([secondCreated.json().id]);
  });
});

describe('journey: staff, managers and signing out', () => {
  it('staff can add, list and edit but not delete; the manager can; nobody gets in after signing out', async () => {
    const person = await signUpAndSignIn();
    const created = await addContact(person, { name: 'Shared contact', phone: uniqueUaeNumber() });
    const contactId = created.json().id as string;

    // The same person, now ordinary staff (the role is read afresh on every request)
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.userId).execute();
    expect((await addContact(person, { name: 'Added by staff', phone: uniqueUaeNumber() })).statusCode).toBe(201);
    expect((await listContacts(person)).total).toBe(2);
    expect(
      (await person.browser.send('PATCH', `/api/v1/contacts/${contactId}`, { name: 'Edited by staff' })).statusCode,
    ).toBe(200);
    expect((await person.browser.send('DELETE', `/api/v1/contacts/${contactId}`)).statusCode).toBe(403);
    expect((await person.browser.send('GET', `/api/v1/contacts/${contactId}`)).statusCode).toBe(200);

    // Back to manager: the delete now works
    await database.system.updateTable('users').set({ role: 'manager' }).where('id', '=', person.userId).execute();
    expect((await person.browser.send('DELETE', `/api/v1/contacts/${contactId}`)).statusCode).toBe(204);

    // After signing out, every contacts route answers 401
    expect((await person.browser.send('POST', '/api/v1/auth/logout')).statusCode).toBe(200);
    expect((await person.browser.send('GET', '/api/v1/contacts')).statusCode).toBe(401);
    expect((await addContact(person, { phone: uniqueUaeNumber() })).statusCode).toBe(401);
    expect((await person.browser.send('GET', `/api/v1/contacts/${contactId}`)).statusCode).toBe(401);
  });
});
