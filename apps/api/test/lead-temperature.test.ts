import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber } from './support/team';

// F10 slice 1: PATCH /leads/{id}/temperature (set hot, warm or cold by hand) and the reason every lead shows.

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

async function businessWithLead() {
  const owner = await signUpOwner(app, database);
  const contact = await owner.ok('POST', '/contacts', { name: 'Priya Menon', phone: uniqueUaeNumber() }, 201);
  const lead = await owner.ok('POST', '/leads', { contactId: contact.id }, 201);
  return { owner, lead };
}

describe('PATCH /leads/{id}/temperature', () => {
  it('starts unscored with no reason, then sets the temperature by hand and says so', async () => {
    const { owner, lead } = await businessWithLead();
    expect(lead).toMatchObject({ temperature: 'unscored', temperatureReason: null, temperatureSetBy: null });

    const hot = await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'hot' });
    expect(hot).toMatchObject({ temperature: 'hot', temperatureReason: 'Set by hand', temperatureSetBy: 'manual' });
    expect((await owner.ok('GET', `/leads/${lead.id}`)).temperature).toBe('hot');
    const cold = await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'cold' });
    expect(cold.temperature).toBe('cold');
  });

  it('writes one activity line per real change, with the field name only', async () => {
    const { owner, lead } = await businessWithLead();
    await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'warm' });
    await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'warm' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'leads.temperature_changed')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.actor).toMatchObject({ kind: 'user', id: owner.userId });
  });

  it('refuses unscored, anything else in the body, and a missing temperature (400)', async () => {
    const { owner, lead } = await businessWithLead();
    await owner.refused('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'unscored' }, 400);
    await owner.refused('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'hot', stageId: lead.stage.id }, 400);
    await owner.refused('PATCH', `/leads/${lead.id}/temperature`, {}, 400);
  });

  it('is 404 for an unknown lead (the 401 is covered for every route by the isolation test)', async () => {
    const { owner } = await businessWithLead();
    await owner.refused(
      'PATCH',
      '/leads/0194c9a8-0000-7000-8000-000000000000/temperature',
      { temperature: 'hot' },
      404,
    );
  });

  it('lets the "own leads only" role change only its own leads', async () => {
    const { owner, lead } = await businessWithLead();
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    await colleague.refused('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'hot' }, 404);
    await owner.ok('POST', `/leads/${lead.id}/assign`, { ownerUserId: colleague.userId });
    expect((await colleague.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature: 'hot' })).temperature).toBe(
      'hot',
    );
  });
});
