import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber } from './support/team';

// GET /tasks/next-due?lead_ids=: the date in the "Next activity" column of the Leads list (the earliest open task of each lead).

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

async function businessWithTwoLeads() {
  const owner = await signUpOwner(app, database);
  const first = await owner.ok('POST', '/contacts', { name: 'Priya', phone: uniqueUaeNumber() }, 201);
  const second = await owner.ok('POST', '/contacts', { name: 'Rahul', phone: uniqueUaeNumber() }, 201);
  const firstLead = await owner.ok('POST', '/leads', { contactId: first.id }, 201);
  const secondLead = await owner.ok('POST', '/leads', { contactId: second.id }, 201);
  return { owner, firstLead, secondLead };
}

describe('GET /tasks/next-due', () => {
  it('gives each lead its earliest open task, and null for a lead with none', async () => {
    const { owner, firstLead, secondLead } = await businessWithTwoLeads();
    await owner.ok('POST', '/tasks', { leadId: firstLead.id, title: 'Later', dueAt: '2030-03-10T10:00:00Z' }, 201);
    await owner.ok('POST', '/tasks', { leadId: firstLead.id, title: 'Sooner', dueAt: '2030-02-01T09:00:00Z' }, 201);
    const found = await owner.ok('GET', `/tasks/next-due?lead_ids=${firstLead.id},${secondLead.id}`);
    expect(found).toEqual({ dates: { [firstLead.id]: '2030-02-01T09:00:00.000Z', [secondLead.id]: null } });
  });

  it('ignores done and deleted tasks, and moves on to the next one', async () => {
    const { owner, firstLead } = await businessWithTwoLeads();
    const sooner = await owner.ok(
      'POST',
      '/tasks',
      { leadId: firstLead.id, title: 'Sooner', dueAt: '2030-02-01T09:00:00Z' },
      201,
    );
    const gone = await owner.ok(
      'POST',
      '/tasks',
      { leadId: firstLead.id, title: 'Gone', dueAt: '2030-02-02T09:00:00Z' },
      201,
    );
    await owner.ok('POST', '/tasks', { leadId: firstLead.id, title: 'Later', dueAt: '2030-03-10T10:00:00Z' }, 201);
    await owner.ok('PATCH', `/tasks/${sooner.id}`, { done: true });
    await owner.ok('DELETE', `/tasks/${gone.id}`, undefined, 204);
    expect((await owner.ok('GET', `/tasks/next-due?lead_ids=${firstLead.id}`)).dates[firstLead.id]).toBe(
      '2030-03-10T10:00:00.000Z',
    );
  });

  it('answers null for a lead of another business', async () => {
    const { owner, firstLead } = await businessWithTwoLeads();
    await owner.ok('POST', '/tasks', { leadId: firstLead.id, title: 'Call', dueAt: '2030-02-01T09:00:00Z' }, 201);
    const other = await signUpOwner(app, database);
    expect((await other.ok('GET', `/tasks/next-due?lead_ids=${firstLead.id}`)).dates).toEqual({ [firstLead.id]: null });
  });

  it('shows the "own leads only" role a date only for leads it owns', async () => {
    const { owner, firstLead } = await businessWithTwoLeads();
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    await owner.ok('POST', '/tasks', { leadId: firstLead.id, title: 'Call', dueAt: '2030-02-01T09:00:00Z' }, 201);
    expect((await colleague.ok('GET', `/tasks/next-due?lead_ids=${firstLead.id}`)).dates[firstLead.id]).toBeNull();
    await owner.ok('POST', `/leads/${firstLead.id}/assign`, { ownerUserId: colleague.userId });
    expect((await colleague.ok('GET', `/tasks/next-due?lead_ids=${firstLead.id}`)).dates[firstLead.id]).toBe(
      '2030-02-01T09:00:00.000Z',
    );
  });

  it('refuses a missing list, something that is not an id, and more than 100 ids (400)', async () => {
    const { owner } = await businessWithTwoLeads();
    await owner.refused('GET', '/tasks/next-due', undefined, 400);
    await owner.refused('GET', '/tasks/next-due?lead_ids=not-an-id', undefined, 400);
    const many = Array.from({ length: 101 }, () => '0194c9a8-0000-7000-8000-000000000000').join(',');
    await owner.refused('GET', `/tasks/next-due?lead_ids=${many}`, undefined, 400);
  });
});
