import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F11 slice 2: GET /views?object=lead and POST /views (saved views of the Leads list).

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

const hotLeadsThisWeek = {
  object: 'lead',
  name: 'My hot leads',
  filters: { status: 'open', owner: 'me' },
  sort: { field: 'createdAt', order: 'desc' },
  layout: 'list',
};

describe('POST /views and GET /views', () => {
  it('saves a view and lists it again with its filters, sort and layout', async () => {
    const owner = await signUpOwner(app, database);
    expect((await owner.ok('GET', '/views?object=lead')).items).toEqual([]);
    const saved = await owner.ok('POST', '/views', hotLeadsThisWeek, 201);
    expect(saved).toMatchObject({ ...hotLeadsThisWeek, shared: false, isMine: true });
    expect((await owner.ok('GET', '/views?object=lead')).items).toEqual([saved]);
  });

  it('fills in plain defaults: no filters, no sort, a table', async () => {
    const owner = await signUpOwner(app, database);
    const saved = await owner.ok('POST', '/views', { object: 'lead', name: '  Everything  ' }, 201);
    expect(saved).toMatchObject({ name: 'Everything', filters: {}, sort: null, layout: 'list' });
  });

  it('keeps views in the order they were saved, and a person sees only their own (nothing is shared yet)', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    await owner.ok('POST', '/views', { object: 'lead', name: 'First' }, 201);
    await owner.ok('POST', '/views', { object: 'lead', name: 'Second' }, 201);
    await colleague.ok('POST', '/views', { object: 'lead', name: 'Hers' }, 201);
    const mine = (await owner.ok('GET', '/views?object=lead')).items.map((view: { name: string }) => view.name);
    expect(mine).toEqual(['First', 'Second']);
    const hers = (await colleague.ok('GET', '/views?object=lead')).items.map((view: { name: string }) => view.name);
    expect(hers).toEqual(['Hers']);
  });

  it('shows a view that was shared to everyone, as not theirs', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    const saved = await owner.ok('POST', '/views', { object: 'lead', name: 'Team view' }, 201);
    await database.system.updateTable('saved_views').set({ shared: true }).where('id', '=', saved.id).execute();
    const seen = (await colleague.ok('GET', '/views?object=lead')).items;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: 'Team view', shared: true, isMine: false });
  });

  it('refuses the same name twice for one person, whatever the capitals (409), but allows it for another person', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    await owner.ok('POST', '/views', { object: 'lead', name: 'My hot leads' }, 201);
    expect(await owner.refused('POST', '/views', { object: 'lead', name: 'MY HOT LEADS' }, 409)).toBe(
      'VIEW_NAME_TAKEN',
    );
    await colleague.ok('POST', '/views', { object: 'lead', name: 'My hot leads' }, 201);
  });

  it('allows 30 views a person and refuses the 31st (409)', { timeout: 60_000 }, async () => {
    const owner = await signUpOwner(app, database);
    for (let count = 1; count <= 30; count += 1) {
      await owner.ok('POST', '/views', { object: 'lead', name: `View ${count}` }, 201);
    }
    expect(await owner.refused('POST', '/views', { object: 'lead', name: 'One too many' }, 409)).toBe('TOO_MANY_VIEWS');
  });

  it('refuses a bad request (400): blank or long name, an unknown list, unknown filters, a stage that is not an id, a made-up sort, extra words', async () => {
    const owner = await signUpOwner(app, database);
    const bad = [
      { object: 'lead', name: '   ' },
      { object: 'lead', name: 'x'.repeat(61) },
      { object: 'companies', name: 'Nope' },
      { object: 'lead', name: 'A', filters: { colour: 'red' } },
      { object: 'lead', name: 'A', filters: { stageId: 'not-an-id' } },
      { object: 'lead', name: 'A', filters: { owner: 'someone-else' } },
      { object: 'lead', name: 'A', sort: { field: 'name', order: 'asc' } },
      { object: 'lead', name: 'A', shared: true },
      { object: 'lead', name: 'A', ownerUserId: owner.userId },
    ];
    for (const body of bad) await owner.refused('POST', '/views', body, 400);
    await owner.refused('GET', '/views', undefined, 400);
    await owner.refused('GET', '/views?object=companies', undefined, 400);
  });

  it('writes one activity line per saved view with field names only', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/views', { object: 'lead', name: 'Secret name' }, 201);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'views.created')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('Secret name');
  });

  it('never shows another business’s views', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/views', { object: 'lead', name: 'Private' }, 201);
    const other = await signUpOwner(app, database);
    expect((await other.ok('GET', '/views?object=lead')).items).toEqual([]);
  });
});
