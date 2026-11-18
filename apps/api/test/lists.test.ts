import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber } from './support/team';

// F11 slice 5: GET /lists and POST /lists (static contact lists).

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

async function businessWithContacts() {
  const owner = await signUpOwner(app, database);
  await owner.ok(
    'POST',
    '/fields',
    { object: 'contact', label: 'Car', type: 'dropdown', options: ['Swift', 'Baleno'] },
    201,
  );
  const make = async (name: string, custom: Record<string, unknown> = {}) =>
    (await owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber(), custom }, 201)).id as string;
  const priya = await make('Priya Menon', { car: 'Swift' });
  const rahul = await make('Rahul Nair', { car: 'Baleno' });
  const meera = await make('Meera Menon');
  return { owner, priya, rahul, meera };
}

describe('POST /lists and GET /lists', () => {
  it('makes a list from contacts picked by hand, and lists it with its member count', async () => {
    const { owner, priya, rahul } = await businessWithContacts();
    const made = await owner.ok(
      'POST',
      '/lists',
      { name: 'Diwali offer 2026', contactIds: [priya, rahul, priya] },
      201,
    );
    expect(made).toMatchObject({ name: 'Diwali offer 2026', memberCount: 2 });
    expect((await owner.ok('GET', '/lists')).items).toEqual([made]);
  });

  it('makes an empty list when nothing is sent but the name', async () => {
    const { owner } = await businessWithContacts();
    expect(await owner.ok('POST', '/lists', { name: 'Later' }, 201)).toMatchObject({ memberCount: 0 });
  });

  it('makes a list from a contacts view: search text, lifecycle stage and the filter engine, once', async () => {
    const { owner, priya, rahul, meera } = await businessWithContacts();
    const bySearch = await owner.ok('POST', '/lists', { name: 'Menons', fromView: { q: 'menon' } }, 201);
    expect(bySearch.memberCount).toBe(2);
    const byFilter = await owner.ok(
      'POST',
      '/lists',
      {
        name: 'Swift owners',
        fromView: { filters: JSON.stringify([{ field: 'custom.car', operator: 'is', value: 'swift' }]) },
      },
      201,
    );
    expect(byFilter.memberCount).toBe(1);
    const both = await owner.ok(
      'POST',
      '/lists',
      {
        name: 'Menons with a car',
        fromView: { q: 'menon', filters: JSON.stringify([{ field: 'custom.car', operator: 'is_not_empty' }]) },
      },
      201,
    );
    expect(both.memberCount).toBe(1);
    // A static list: a contact who changes later stays in it
    await owner.ok('PATCH', `/contacts/${priya}`, { custom: { car: null } });
    const stored = await database.system
      .selectFrom('contact_list_members')
      .select('contact_id')
      .where('list_id', '=', byFilter.id)
      .execute();
    expect(stored.map((row) => row.contact_id)).toEqual([priya]);
    expect(rahul && meera).toBeTruthy();
  });

  it('does not count a contact that was deleted', async () => {
    const { owner, priya, rahul } = await businessWithContacts();
    const made = await owner.ok('POST', '/lists', { name: 'Two', contactIds: [priya, rahul] }, 201);
    await owner.ok('DELETE', `/contacts/${rahul}`, undefined, 204);
    expect((await owner.ok('GET', '/lists')).items[0].memberCount).toBe(1);
    expect(made.memberCount).toBe(2);
  });

  it('refuses the same name twice whatever the capitals (409), and saves nothing when it does', async () => {
    const { owner, priya } = await businessWithContacts();
    await owner.ok('POST', '/lists', { name: 'Diwali' }, 201);
    expect(await owner.refused('POST', '/lists', { name: 'DIWALI', contactIds: [priya] }, 409)).toBe('LIST_NAME_TAKEN');
    const members = await database.system
      .selectFrom('contact_list_members')
      .select('contact_id')
      .where('account_id', '=', owner.businessId)
      .execute();
    expect(members).toEqual([]);
  });

  it('refuses a contact that is not the business’s (404, nothing saved), and a bad request (400)', async () => {
    const { owner, priya } = await businessWithContacts();
    const stranger = await signUpOwner(app, database);
    const theirs = (await stranger.ok('POST', '/contacts', { name: 'Not yours', phone: uniqueUaeNumber() }, 201)).id;
    await owner.refused('POST', '/lists', { name: 'Mixed', contactIds: [priya, theirs] }, 404);
    await owner.refused(
      'POST',
      '/lists',
      { name: 'Unknown', contactIds: ['0194c9a8-0000-7000-8000-000000000000'] },
      404,
    );
    expect((await owner.ok('GET', '/lists')).items).toEqual([]);
    for (const body of [
      { name: '  ' },
      { name: 'x'.repeat(81) },
      {},
      { name: 'A', contactIds: ['nope'] },
      { name: 'A', contactIds: [priya], fromView: { q: 'x' } },
      { name: 'A', fromView: { colour: 'red' } },
      { name: 'A', ownerUserId: owner.userId },
      { name: 'A', contactIds: Array.from({ length: 501 }, () => priya) },
    ]) {
      await owner.refused('POST', '/lists', body, 400);
    }
    expect(await owner.refused('POST', '/lists', { name: 'Bad filter', fromView: { filters: 'oops' } }, 400)).toBe(
      'INVALID_FILTERS',
    );
  });

  it('refuses a view that matches more than 5000 contacts (409), and saves nothing', { timeout: 120_000 }, async () => {
    const owner = await signUpOwner(app, database);
    await sql`
      insert into app.contacts (id, account_id, name, phone)
      select gen_random_uuid(), ${owner.businessId}::uuid, 'Bulk ' || n, '+9197' || lpad(n::text, 8, '0')
      from generate_series(1, 5001) as n`.execute(database.system);
    expect(await owner.refused('POST', '/lists', { name: 'Everyone', fromView: { q: 'bulk' } }, 409)).toBe(
      'LIST_TOO_BIG',
    );
    expect((await owner.ok('GET', '/lists')).items).toEqual([]);
  });

  it('shows each business only its own lists, to every role', async () => {
    const { owner, priya } = await businessWithContacts();
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    await owner.ok('POST', '/lists', { name: 'Shared', contactIds: [priya] }, 201);
    expect((await staff.ok('GET', '/lists')).items).toHaveLength(1);
    const other = await signUpOwner(app, database);
    expect((await other.ok('GET', '/lists')).items).toEqual([]);
  });

  it('writes one activity line per list, without its name', async () => {
    const { owner } = await businessWithContacts();
    await owner.ok('POST', '/lists', { name: 'Secret list name' }, 201);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'lists.created')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('Secret list name');
  });
});
