import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F11 slice 1: GET /search?q= (the search box at the top of every page).

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

/** A business with a person, a company and a lead for the person. */
async function businessWithPeople() {
  const owner = await signUpOwner(app, database);
  const priya = await owner.ok(
    'POST',
    '/contacts',
    { name: 'Priya Menon', phone: '+919847012345', email: 'priya@menon.example' },
    201,
  );
  await owner.ok('POST', '/contacts', { name: 'Rahul Nair', phone: '+919447000111' }, 201);
  await owner.ok('POST', '/companies', { name: 'Menon Weddings', domain: 'menonweddings.example', city: 'Kochi' }, 201);
  const lead = await owner.ok('POST', '/leads', { contactId: priya.id, interest: 'Hall for 200' }, 201);
  return { owner, priya, lead };
}

describe('GET /search', () => {
  it('finds people, companies and leads by a name', async () => {
    const { owner, priya, lead } = await businessWithPeople();
    const found = await owner.ok('GET', '/search?q=menon');
    expect(found.contacts.map((person: { id: string }) => person.id)).toEqual([priya.id]);
    expect(found.companies.map((company: { name: string }) => company.name)).toEqual(['Menon Weddings']);
    expect(found.leads).toEqual([
      {
        id: lead.id,
        contactId: priya.id,
        contactName: 'Priya Menon',
        contactPhone: '+919847012345',
        stageName: expect.any(String),
        interest: 'Hall for 200',
      },
    ]);
  });

  it('finds a phone number however it is typed', async () => {
    const { owner, priya } = await businessWithPeople();
    for (const typed of ['98470', '+91 98470', '098470 12345', '9847012']) {
      const found = await owner.ok('GET', `/search?q=${encodeURIComponent(typed)}`);
      expect(
        found.contacts.map((person: { id: string }) => person.id),
        typed,
      ).toEqual([priya.id]);
    }
  });

  it('finds by email and by a company’s website or city, and ignores capitals', async () => {
    const { owner, priya } = await businessWithPeople();
    expect((await owner.ok('GET', '/search?q=PRIYA@menon')).contacts[0].id).toBe(priya.id);
    expect((await owner.ok('GET', '/search?q=kochi')).companies).toHaveLength(1);
    expect((await owner.ok('GET', '/search?q=menonweddings')).companies).toHaveLength(1);
  });

  it('finds nothing for a word nobody has, and treats % and _ as plain letters', async () => {
    const { owner } = await businessWithPeople();
    expect(await owner.ok('GET', '/search?q=zzzz')).toEqual({ contacts: [], companies: [], leads: [] });
    expect(await owner.ok('GET', '/search?q=%25%25')).toEqual({ contacts: [], companies: [], leads: [] });
  });

  it('shows at most 5 of each kind', async () => {
    const owner = await signUpOwner(app, database);
    for (let count = 0; count < 7; count += 1) {
      await owner.ok('POST', '/contacts', { name: `Meera Shah ${count}`, email: `meera${count}@shah.example` }, 201);
      await owner.ok('POST', '/companies', { name: `Meera Foods ${count}` }, 201);
    }
    const found = await owner.ok('GET', '/search?q=meera');
    expect(found.contacts).toHaveLength(5);
    expect(found.companies).toHaveLength(5);
  });

  it('refuses a missing, blank or one-letter search (400)', async () => {
    const { owner } = await businessWithPeople();
    await owner.refused('GET', '/search', undefined, 400);
    await owner.refused('GET', '/search?q=', undefined, 400);
    await owner.refused('GET', '/search?q=a', undefined, 400);
    await owner.refused('GET', `/search?q=${'x'.repeat(101)}`, undefined, 400);
  });

  it('shows the "own leads only" role only its own leads, but every person and company', async () => {
    const { owner, priya, lead } = await businessWithPeople();
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    const before = await colleague.ok('GET', '/search?q=menon');
    expect(before.contacts).toHaveLength(1);
    expect(before.companies).toHaveLength(1);
    expect(before.leads).toEqual([]);
    await owner.ok('POST', `/leads/${lead.id}/assign`, { ownerUserId: colleague.userId });
    expect((await colleague.ok('GET', '/search?q=menon')).leads.map((entry: { id: string }) => entry.id)).toEqual([
      lead.id,
    ]);
    expect(priya.id).toBeTruthy();
  });

  it('never shows another business’s people', async () => {
    await businessWithPeople();
    const other = await signUpOwner(app, database);
    expect(await other.ok('GET', '/search?q=menon')).toEqual({ contacts: [], companies: [], leads: [] });
  });
});
