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

describe('PATCH /views/{id} and DELETE /views/{id}', () => {
  it('renames and changes what a view shows, and writes one activity line with field names only', async () => {
    const owner = await signUpOwner(app, database);
    const saved = await owner.ok('POST', '/views', { object: 'lead', name: 'Old name' }, 201);
    const changed = await owner.ok('PATCH', `/views/${saved.id}`, {
      name: 'New name',
      filters: { status: 'closed' },
      sort: { field: 'stage', order: 'asc' },
      layout: 'pipeline',
    });
    expect(changed).toMatchObject({
      name: 'New name',
      filters: { status: 'closed' },
      sort: { field: 'stage', order: 'asc' },
      layout: 'pipeline',
    });
    // The same again changes nothing and logs nothing more
    await owner.ok('PATCH', `/views/${saved.id}`, { name: 'New name' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'views.updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('New name');
  });

  it('clears the sort with null and refuses an empty change, a taken name and extra words', async () => {
    const owner = await signUpOwner(app, database);
    const first = await owner.ok(
      'POST',
      '/views',
      { object: 'lead', name: 'First', sort: { field: 'createdAt', order: 'asc' } },
      201,
    );
    await owner.ok('POST', '/views', { object: 'lead', name: 'Second' }, 201);
    expect((await owner.ok('PATCH', `/views/${first.id}`, { sort: null })).sort).toBeNull();
    expect(await owner.refused('PATCH', `/views/${first.id}`, {}, 400)).toBe('NOTHING_TO_CHANGE');
    expect(await owner.refused('PATCH', `/views/${first.id}`, { name: 'second' }, 409)).toBe('VIEW_NAME_TAKEN');
    await owner.refused('PATCH', `/views/${first.id}`, { name: '   ' }, 400);
    await owner.refused('PATCH', `/views/${first.id}`, { ownerUserId: owner.userId }, 400);
    await owner.refused('PATCH', `/views/${first.id}`, { object: 'lead' }, 400);
  });

  it('lets only a manager share a view, and then colleagues see it as not theirs', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    const mine = await owner.ok('POST', '/views', { object: 'lead', name: 'Team view' }, 201);
    expect((await owner.ok('PATCH', `/views/${mine.id}`, { shared: true })).shared).toBe(true);
    expect((await colleague.ok('GET', '/views?object=lead')).items[0]).toMatchObject({
      name: 'Team view',
      isMine: false,
    });

    const hers = await colleague.ok('POST', '/views', { object: 'lead', name: 'Hers' }, 201);
    await colleague.refused('PATCH', `/views/${hers.id}`, { shared: true }, 403);
    await colleague.refused('PATCH', `/views/${hers.id}`, { shared: false }, 403);
  });

  it('keeps a colleague out: 404 for an unshared view, 403 for a shared one they may not change', async () => {
    const owner = await signUpOwner(app, database);
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    const view = await owner.ok('POST', '/views', { object: 'lead', name: 'Private' }, 201);
    await colleague.refused('PATCH', `/views/${view.id}`, { name: 'Mine now' }, 404);
    await colleague.refused('DELETE', `/views/${view.id}`, undefined, 404);
    await owner.ok('PATCH', `/views/${view.id}`, { shared: true });
    await colleague.refused('PATCH', `/views/${view.id}`, { name: 'Mine now' }, 403);
    await colleague.refused('DELETE', `/views/${view.id}`, undefined, 403);
    expect((await owner.ok('GET', '/views?object=lead')).items[0].name).toBe('Private');
  });

  it('lets another manager stop sharing or delete a shared view, but not change what it shows', async () => {
    const owner = await signUpOwner(app, database);
    const otherManager = await addTeamMember(app, database, owner, { name: 'Meera', role: 'manager' });
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    const view = await staff.ok('POST', '/views', { object: 'lead', name: 'Hers' }, 201);
    // Not shared yet: the manager cannot see it, so it does not exist for them
    await otherManager.refused('DELETE', `/views/${view.id}`, undefined, 404);
    await database.system.updateTable('saved_views').set({ shared: true }).where('id', '=', view.id).execute();
    await otherManager.refused('PATCH', `/views/${view.id}`, { name: 'Renamed by manager' }, 403);
    expect((await otherManager.ok('PATCH', `/views/${view.id}`, { shared: false })).shared).toBe(false);
    await database.system.updateTable('saved_views').set({ shared: true }).where('id', '=', view.id).execute();
    await otherManager.ok('DELETE', `/views/${view.id}`, undefined, 204);
    expect((await staff.ok('GET', '/views?object=lead')).items).toEqual([]);
  });

  it('deletes the owner’s own view for good and logs it without its name', async () => {
    const owner = await signUpOwner(app, database);
    const saved = await owner.ok('POST', '/views', { object: 'lead', name: 'Delete me' }, 201);
    await owner.ok('DELETE', `/views/${saved.id}`, undefined, 204);
    expect((await owner.ok('GET', '/views?object=lead')).items).toEqual([]);
    await owner.refused('DELETE', `/views/${saved.id}`, undefined, 404);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'views.deleted')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('Delete me');
  });

  it('answers 404 for an unknown id and 400 for something that is not an id', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('PATCH', '/views/0194c9a8-0000-7000-8000-000000000000', { name: 'X' }, 404);
    await owner.refused('DELETE', '/views/0194c9a8-0000-7000-8000-000000000000', undefined, 404);
    await owner.refused('PATCH', '/views/not-an-id', { name: 'X' }, 400);
  });
});
