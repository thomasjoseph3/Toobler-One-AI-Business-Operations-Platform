import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner } from './support/team';

// F09 slice 3: the answers to custom fields on contacts (saved with POST and PATCH /contacts, shown on every read).

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

/** A business with a few contact fields. */
async function businessWithFields() {
  const owner = await signUpOwner(app, database);
  await owner.ok('POST', '/fields', { object: 'contact', label: 'Birthday', type: 'date' }, 201);
  await owner.ok('POST', '/fields', { object: 'contact', label: 'Guests', type: 'number' }, 201);
  await owner.ok(
    'POST',
    '/fields',
    { object: 'contact', label: 'Car', type: 'dropdown', options: ['Swift', 'Baleno'] },
    201,
  );
  await owner.ok('POST', '/fields', { object: 'contact', label: 'VIP', type: 'yes_no' }, 201);
  return owner;
}

describe('custom values on contacts', () => {
  it('saves tidy answers when adding a contact and shows them on the contact, the list and the page', async () => {
    const owner = await businessWithFields();
    const contact = await owner.ok(
      'POST',
      '/contacts',
      { phone: '+919847012345', custom: { birthday: '1990-05-04', guests: '1,200', car: 'swift', vip: 'yes' } },
      201,
    );
    expect(contact.custom).toEqual({ birthday: '1990-05-04', guests: 1200, car: 'Swift', vip: true });
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).custom).toEqual(contact.custom);
    expect((await owner.ok('GET', '/contacts')).items[0].custom).toEqual(contact.custom);
  });

  it('changes only the keys sent, removes a key with null or blank, and a contact without answers has none', async () => {
    const owner = await businessWithFields();
    const contact = await owner.ok(
      'POST',
      '/contacts',
      { phone: '+919847012346', custom: { birthday: '1990-05-04', guests: 5 } },
      201,
    );
    const changed = await owner.ok('PATCH', `/contacts/${contact.id}`, { custom: { guests: 7, car: 'Baleno' } }, 200);
    expect(changed.custom).toEqual({ birthday: '1990-05-04', guests: 7, car: 'Baleno' });
    const removed = await owner.ok('PATCH', `/contacts/${contact.id}`, { custom: { birthday: null, car: '  ' } }, 200);
    expect(removed.custom).toEqual({ guests: 7 });
    const plain = await owner.ok('POST', '/contacts', { phone: '+919847012347' }, 201);
    expect(plain.custom).toEqual({});
  });

  it('sending the same answers again changes nothing (no log line)', async () => {
    const owner = await businessWithFields();
    const contact = await owner.ok('POST', '/contacts', { phone: '+919847012348', custom: { guests: 3 } }, 201);
    await owner.ok('PATCH', `/contacts/${contact.id}`, { custom: { guests: 3 } }, 200);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'contacts.updated')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('refuses wrong answers (400 INVALID_CUSTOM_VALUES), unknown keys and removed fields, and saves nothing', async () => {
    const owner = await businessWithFields();
    expect(
      await owner.refused('POST', '/contacts', { phone: '+919847012349', custom: { birthday: 'soon' } }, 400),
    ).toBe('INVALID_CUSTOM_VALUES');
    await owner.refused('POST', '/contacts', { phone: '+919847012349', custom: { guests: 'many' } }, 400);
    await owner.refused('POST', '/contacts', { phone: '+919847012349', custom: { car: 'Tesla' } }, 400);
    await owner.refused('POST', '/contacts', { phone: '+919847012349', custom: { nothing_here: 'x' } }, 400);
    await owner.refused('POST', '/contacts', { phone: '+919847012349', custom: 'text' }, 400);
    expect((await owner.ok('GET', '/contacts')).items).toEqual([]);
    const contact = await owner.ok('POST', '/contacts', { phone: '+919847012349', custom: { guests: 2 } }, 201);
    await owner.refused('PATCH', `/contacts/${contact.id}`, { name: 'New name', custom: { vip: 'maybe' } }, 400);
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).name).toBeNull();
  });

  it('keeps the answers of a removed field hidden, and does not take answers for it', async () => {
    const owner = await businessWithFields();
    const contact = await owner.ok(
      'POST',
      '/contacts',
      { phone: '+919847012350', custom: { guests: 9, vip: true } },
      201,
    );
    const guests = (await owner.ok('GET', '/fields?object=contact')).items.find(
      (field: { key: string }) => field.key === 'guests',
    );
    await owner.ok('DELETE', `/fields/${guests.id}`, undefined, 204);
    expect((await owner.ok('GET', `/contacts/${contact.id}`)).custom).toEqual({ vip: true });
    expect((await owner.ok('GET', '/contacts')).items[0].custom).toEqual({ vip: true });
    await owner.refused('PATCH', `/contacts/${contact.id}`, { custom: { guests: 1 } }, 400);
    // The saved answer is still in the database
    const row = await database.system
      .selectFrom('contacts')
      .select('custom')
      .where('id', '=', contact.id)
      .executeTakeFirstOrThrow();
    expect(row.custom).toMatchObject({ guests: 9 });
  });

  it('uses only the business’s own fields, and keeps the answers out of the activity log', async () => {
    const owner = await businessWithFields();
    const stranger = await signUpOwner(app, database);
    await stranger.refused('POST', '/contacts', { phone: '+919847012351', custom: { guests: 2 } }, 400);
    await owner.ok('POST', '/contacts', { phone: '+919847012352', custom: { birthday: '1991-01-02' } }, 201);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'contacts.created')
      .execute();
    expect(JSON.stringify(lines)).not.toContain('1991-01-02');
  });
});
