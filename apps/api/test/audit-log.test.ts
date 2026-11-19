import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F02 slice 7: the activity log screen's API: who did what, when, for managers only, by business, with filters.

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

describe('GET /api/v1/audit-log', () => {
  it('shows who did what, newest first, with the person’s name and field names only', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await owner.ok('POST', '/teams', { name: 'Secret Team Name', memberIds: [staff.userId] }, 201);
    await owner.ok('PATCH', `/team/members/${staff.userId}`, { role: 'staff_own' });

    const log = await owner.ok('GET', '/audit-log');
    const kinds = log.items.map((line: { kind: string }) => line.kind);
    expect(kinds.indexOf('team.role_changed')).toBeLessThan(kinds.indexOf('teams.created'));
    expect(kinds).toContain('auth.signed_up');
    const roleLine = log.items.find((line: { kind: string }) => line.kind === 'team.role_changed');
    expect(roleLine).toMatchObject({
      actor: { kind: 'user', userId: owner.userId, name: 'Anita Nair' },
      recordType: 'user',
      recordId: staff.userId,
      fields: ['role'],
    });
    expect(log.total).toBe(log.items.length);
    // Never the words of the business
    expect(JSON.stringify(log)).not.toContain('Secret Team Name');
    expect(JSON.stringify(log)).not.toContain('staff_own');
    // Never where the person was
    expect(Object.keys(roleLine).sort()).toEqual([
      'actor',
      'createdAt',
      'fields',
      'id',
      'kind',
      'recordId',
      'recordType',
    ]);
  });

  it('narrows by person, by area and by time, and pages', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    await owner.ok('POST', '/teams', { name: 'Sales' }, 201);
    await owner.ok('POST', '/teams', { name: 'Support' }, 201);
    const contact = await staff.ok(
      'POST',
      '/contacts',
      { name: 'Priya Menon', phone: `+9715${Math.floor(Math.random() * 90_000_000) + 10_000_000}` },
      201,
    );
    expect(contact.id).toBeTruthy();

    const byStaff = await owner.ok('GET', `/audit-log?person=${staff.userId}`);
    expect(byStaff.items.length).toBeGreaterThan(0);
    expect(byStaff.items.every((line: { actor: { userId: string } }) => line.actor.userId === staff.userId)).toBe(true);

    const teamsOnly = await owner.ok('GET', '/audit-log?area=team,teams');
    expect(teamsOnly.items.map((line: { kind: string }) => line.kind).sort()).toEqual([
      'teams.created',
      'teams.created',
    ]);
    const contactsOnly = await owner.ok('GET', '/audit-log?area=contacts');
    expect(contactsOnly.items.map((line: { kind: string }) => line.kind)).toEqual(['contacts.created']);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await owner.ok('GET', `/audit-log?from=${encodeURIComponent(future)}`)).items).toEqual([]);
    expect((await owner.ok('GET', `/audit-log?to=${encodeURIComponent(future)}`)).total).toBeGreaterThan(2);
    expect(
      (await owner.ok('GET', `/audit-log?to=${encodeURIComponent(new Date(2020, 1, 1).toISOString())}`)).items,
    ).toEqual([]);

    const firstPage = await owner.ok('GET', '/audit-log?limit=2&page=1');
    const secondPage = await owner.ok('GET', '/audit-log?limit=2&page=2');
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(secondPage.total);
    expect(secondPage.items.map((line: { id: string }) => line.id)).not.toContain(firstPage.items[0].id);
  });

  it('never shows another business’s lines, and a person of another business filters to nothing', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    await stranger.ok('POST', '/teams', { name: 'Strangers only' }, 201);
    const log = await owner.ok('GET', '/audit-log');
    expect(log.items.every((line: { actor: { userId: string | null } }) => line.actor.userId !== stranger.userId)).toBe(
      true,
    );
    expect(log.items.map((line: { kind: string }) => line.kind)).not.toContain('teams.created');
    expect((await owner.ok('GET', `/audit-log?person=${stranger.userId}`)).items).toEqual([]);
  });

  it('refuses bad filters (400)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('GET', '/audit-log?person=nope', undefined, 400);
    await owner.refused('GET', '/audit-log?area=Bad-Area', undefined, 400);
    await owner.refused('GET', '/audit-log?from=yesterday', undefined, 400);
    await owner.refused('GET', '/audit-log?limit=1000', undefined, 400);
    await owner.refused('GET', '/audit-log?page=0', undefined, 400);
    await owner.refused('GET', `/audit-log?area=${'a,'.repeat(13)}`, undefined, 400);
  });

  it('is for managers only (403) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await staff.refused('GET', '/audit-log', undefined, 403);
    const nobody = await app.inject({ method: 'GET', url: '/api/v1/audit-log', headers: unsafeRequestHeaders });
    expect(nobody.statusCode).toBe(401);
  });

  it('gives an unknown person id an empty answer, not an error', async () => {
    const owner = await signUpOwner(app, database);
    expect((await owner.ok('GET', `/audit-log?person=${randomUUID()}`)).items).toEqual([]);
  });
});
