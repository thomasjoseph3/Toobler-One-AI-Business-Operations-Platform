import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F02 slice 5: adding a team with its people, and listing teams.

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

describe('POST /api/v1/teams', () => {
  it('adds a team with its people, who then show their team in the people list', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const meera = await addTeamMember(app, database, owner, { name: 'Meera Pillai', role: 'staff_own' });

    const team = await owner.ok('POST', '/teams', { name: ' Sales ', memberIds: [rahul.userId, meera.userId] }, 201);
    expect(team).toMatchObject({ name: 'Sales' });
    expect(team.members.map((member: { name: string }) => member.name)).toEqual(['Meera Pillai', 'Rahul Das']);

    const people = await owner.ok('GET', '/team');
    const rahulRow = people.members.find((member: { id: string }) => member.id === rahul.userId);
    expect(rahulRow.teams).toEqual([{ id: team.id, name: 'Sales' }]);
    expect(people.members.find((member: { id: string }) => member.id === owner.userId).teams).toEqual([]);
  });

  it('adds an empty team when no people are named, and a person may be in several teams', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const empty = await owner.ok('POST', '/teams', { name: 'Front office' }, 201);
    expect(empty.members).toEqual([]);
    await owner.ok('POST', '/teams', { name: 'Sales', memberIds: [rahul.userId] }, 201);
    await owner.ok('POST', '/teams', { name: 'Weekends', memberIds: [rahul.userId, rahul.userId] }, 201);
    const people = await owner.ok('GET', '/team');
    const rahulRow = people.members.find((member: { id: string }) => member.id === rahul.userId);
    expect(rahulRow.teams.map((team: { name: string }) => team.name)).toEqual(['Sales', 'Weekends']);
  });

  it('refuses a name the business already uses, whatever the capital letters (409)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/teams', { name: 'Sales' }, 201);
    expect(await owner.refused('POST', '/teams', { name: 'SALES' }, 409)).toBe('TEAM_NAME_TAKEN');
    // Another business may use the same name
    const other = await signUpOwner(app, database);
    await other.ok('POST', '/teams', { name: 'Sales' }, 201);
  });

  it('refuses a person who is unknown, removed or from another business (404) and saves nothing', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const gone = await addTeamMember(app, database, owner, { name: 'Gone', role: 'staff' });
    await owner.ok('DELETE', `/team/members/${gone.userId}`, undefined, 204);
    for (const memberId of [randomUUID(), stranger.userId, gone.userId]) {
      expect(await owner.refused('POST', '/teams', { name: 'Sales', memberIds: [memberId] }, 404)).toBe('NOT_FOUND');
    }
    expect((await owner.ok('GET', '/teams')).items).toEqual([]);
  });

  it('refuses a bad request (400): no name, a blank name, a too long name, bad ids', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('POST', '/teams', {}, 400);
    await owner.refused('POST', '/teams', { name: '   ' }, 400);
    await owner.refused('POST', '/teams', { name: 'x'.repeat(61) }, 400);
    await owner.refused('POST', '/teams', { name: 'Sales', memberIds: ['nope'] }, 400);
    await owner.refused('POST', '/teams', { name: 'Sales', memberIds: 'nope' }, 400);
  });

  it('is for managers only (403) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await staff.refused('POST', '/teams', { name: 'Sales' }, 403);
    const nobody = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      headers: unsafeRequestHeaders,
      payload: { name: 'Sales' },
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('writes the activity log with field names only', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/teams', { name: 'Secret Team Name' }, 201);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'teams.created')
      .executeTakeFirstOrThrow();
    expect(line.fields).toEqual(['name']);
    expect(JSON.stringify(line)).not.toContain('Secret Team Name');
  });
});

describe('GET /api/v1/teams', () => {
  it('lists the teams by name with their people, for managers and staff alike, and never another business’s', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    await owner.ok('POST', '/teams', { name: 'Weekends', memberIds: [rahul.userId] }, 201);
    await owner.ok('POST', '/teams', { name: 'Front office' }, 201);
    const stranger = await signUpOwner(app, database);
    await stranger.ok('POST', '/teams', { name: 'Strangers only' }, 201);

    for (const person of [owner, rahul]) {
      const answer = await person.ok('GET', '/teams');
      expect(answer.items.map((team: { name: string }) => team.name)).toEqual(['Front office', 'Weekends']);
      expect(answer.items[1].members).toEqual([{ userId: rahul.userId, name: 'Rahul Das' }]);
    }
  });

  it('needs a sign-in (401)', async () => {
    const nobody = await app.inject({ method: 'GET', url: '/api/v1/teams' });
    expect(nobody.statusCode).toBe(401);
  });
});
