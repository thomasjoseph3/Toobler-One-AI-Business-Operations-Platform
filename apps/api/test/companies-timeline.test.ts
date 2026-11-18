import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F05 slice 4: a company's combined timeline (`GET /activities?company_id=`): the notes and news of all its people and their leads, together.

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

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** A contact in the company with one lead, and a note on the contact. */
async function addPerson(owner: TeamMember, companyId: string, name: string, note: string) {
  const contact = await owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
  await owner.ok('PUT', `/contacts/${contact.id}/company`, { companyId });
  const lead = await owner.ok('POST', '/leads', { contactId: contact.id, interest: `${name}'s trip` }, 201);
  await owner.ok('POST', '/notes', { contactId: contact.id, body: note }, 201);
  return { contact, lead };
}

describe('GET /api/v1/activities?company_id=', () => {
  it('shows the notes and news of every person in the company and of their leads, newest first, and nobody else’s', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await addPerson(owner, company.id, 'Priya Menon', 'Priya asked for a quote');
    const meera = await addPerson(owner, company.id, 'Meera Pillai', 'Meera wants a hall');
    // Someone outside the company
    const outsider = await owner.ok('POST', '/contacts', { name: 'Arjun Nair', phone: uniqueUaeNumber() }, 201);
    await owner.ok('POST', '/notes', { contactId: outsider.id, body: 'Arjun is not in the company' }, 201);

    const answer = await owner.ok('GET', `/activities?company_id=${company.id}`);
    const bodies = answer.items.map((item: { body: string | null }) => item.body).filter(Boolean);
    expect(bodies).toEqual(['Meera wants a hall', 'Priya asked for a quote']);
    // The news lines of both leads (a lead was added) are there too
    const kinds = answer.items.map((item: { kind: string }) => item.kind);
    expect(kinds.filter((kind: string) => kind === 'note')).toHaveLength(2);
    expect(JSON.stringify(answer)).not.toContain('Arjun is not in the company');
    expect(answer.total).toBe(answer.items.length);
    expect(priya.lead.id).not.toBe(meera.lead.id);
  });

  it('narrows by kind, like the other timelines', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    await addPerson(owner, company.id, 'Priya Menon', 'A note');
    const notesOnly = await owner.ok('GET', `/activities?company_id=${company.id}&kind=note`);
    expect(notesOnly.items.every((item: { kind: string }) => item.kind === 'note')).toBe(true);
    expect(notesOnly.items).toHaveLength(1);
  });

  it('is empty for a company with nobody in it, and stops showing a person who was taken out', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    expect((await owner.ok('GET', `/activities?company_id=${company.id}`)).items).toEqual([]);
    const priya = await addPerson(owner, company.id, 'Priya Menon', 'A note');
    expect((await owner.ok('GET', `/activities?company_id=${company.id}`)).items.length).toBeGreaterThan(0);
    await owner.ok('PUT', `/contacts/${priya.contact.id}/company`, { companyId: null });
    expect((await owner.ok('GET', `/activities?company_id=${company.id}`)).items).toEqual([]);
  });

  it('answers 404 for an unknown, deleted or another business’s company', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const strangersCompany = await stranger.ok('POST', '/companies', { name: 'Other Ltd' }, 201);
    const deleted = await owner.ok('POST', '/companies', { name: 'Gone Ltd' }, 201);
    await owner.ok('DELETE', `/companies/${deleted.id}`, undefined, 204);
    await owner.refused('GET', `/activities?company_id=${strangersCompany.id}`, undefined, 404);
    await owner.refused('GET', `/activities?company_id=${randomUUID()}`, undefined, 404);
    await owner.refused('GET', `/activities?company_id=${deleted.id}`, undefined, 404);
  });

  it('needs exactly one of lead_id, contact_id and company_id (400), and a real id (400)', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const contact = await owner.ok('POST', '/contacts', { name: 'Priya', phone: uniqueUaeNumber() }, 201);
    expect(await owner.refused('GET', '/activities', undefined, 400)).toBe('FILTER_NEEDED');
    expect(
      await owner.refused('GET', `/activities?company_id=${company.id}&contact_id=${contact.id}`, undefined, 400),
    ).toBe('FILTER_NEEDED');
    await owner.refused('GET', '/activities?company_id=nope', undefined, 400);
  });

  it('is closed to the "own leads only" role (403), which would see other people’s leads, and open to staff', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Meera Pillai', role: 'staff_own' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    await staff.ok('GET', `/activities?company_id=${company.id}`);
    await staffOwn.refused('GET', `/activities?company_id=${company.id}`, undefined, 403);
  });

  it('needs a sign-in (401)', async () => {
    const nobody = await app.inject({ method: 'GET', url: `/api/v1/activities?company_id=${randomUUID()}` });
    expect(nobody.statusCode).toBe(401);
  });
});
