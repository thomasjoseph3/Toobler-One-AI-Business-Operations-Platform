import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { handleTeamMemberRemoved as handOverLeads } from '../src/modules/core/leads/services/lifecycle-events.service';
import { handleTeamMemberRemoved as handOverOfferings } from '../src/modules/core/offerings/services/team-events.service';
import { handleTeamMemberRemoved as handOverTasks } from '../src/modules/core/tasks/services/team-events.service';
import { handleTeamMemberRemoved as handOverTickets } from '../src/modules/core/tickets/services/team-events.service';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F02 slice 3: changing a person's role, and removing a person (or adding them back), with the open leads, tasks and tickets handed over.

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

/** Gives the saved `team.member_removed` events of one business to the four handlers, the way the dispatcher would. Returns how many events it found. */
async function deliverRemovalEvents(businessId: string): Promise<number> {
  const rows = await database.system
    .selectFrom('domain_events')
    .selectAll()
    .where('account_id', '=', businessId)
    .where('name', '=', 'team.member_removed')
    .execute();
  const contextFor = createContextFactory(database);
  for (const row of rows) {
    const event: DomainEvent = {
      id: row.id,
      accountId: row.account_id,
      name: row.name,
      payload: row.payload as Record<string, unknown>,
      occurredAt: row.occurred_at,
    };
    for (const handler of [handOverLeads, handOverTasks, handOverTickets, handOverOfferings]) {
      await handler(event, contextFor(businessId, { kind: 'system', id: 'test' }));
    }
  }
  return rows.length;
}

/** A business with a manager and one staff member, and a lead, a task, a ticket and an offering that the staff member looks after. */
async function businessWithWorkOf(role: 'staff' | 'staff_own' = 'staff') {
  const owner = await signUpOwner(app, database);
  const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role });
  const contact = await owner.ok('POST', '/contacts', { name: 'Priya Menon', phone: uniqueUaeNumber() }, 201);
  const openLead = await owner.ok(
    'POST',
    '/leads',
    { contactId: contact.id, interest: 'Room', ownerUserId: staff.userId },
    201,
  );
  const otherContact = await owner.ok('POST', '/contacts', { name: 'Kiran Rao', phone: uniqueUaeNumber() }, 201);
  const wonLead = await owner.ok(
    'POST',
    '/leads',
    { contactId: otherContact.id, interest: 'Hall', ownerUserId: staff.userId },
    201,
  );
  const pipeline = await owner.ok('GET', '/pipeline');
  const wonStage = pipeline.stages.find((stage: { kind: string }) => stage.kind === 'won');
  await owner.ok('POST', `/leads/${wonLead.id}/move`, { stageId: wonStage.id });
  const task = await owner.ok(
    'POST',
    '/tasks',
    { leadId: openLead.id, title: 'Call back', dueAt: '2030-01-01T10:00:00Z', ownerUserId: staff.userId },
    201,
  );
  const ticket = await owner.ok(
    'POST',
    '/tickets',
    { contactId: contact.id, title: 'Refund', ownerUserId: staff.userId },
    201,
  );
  const offering = await owner.ok('POST', '/offerings', { name: 'Deluxe room', ownerUserId: staff.userId }, 201);
  return { owner, staff, openLead, wonLead, task, ticket, offering };
}

describe('PATCH /api/v1/team/members/{id}', () => {
  it('changes a role, and the person’s very next request already follows it', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await staff.refused('GET', '/team', undefined, 403);

    const changed = await owner.ok('PATCH', `/team/members/${staff.userId}`, { role: 'manager' });
    expect(changed).toMatchObject({ id: staff.userId, role: 'manager', status: 'active' });
    expect((await staff.ok('GET', '/team')).members).toHaveLength(2);

    await owner.ok('PATCH', `/team/members/${staff.userId}`, { role: 'staff_own' });
    await staff.refused('GET', '/team', undefined, 403);
  });

  it('keeps at least one manager: the last manager cannot be made staff (409)', async () => {
    const owner = await signUpOwner(app, database);
    expect(await owner.refused('PATCH', `/team/members/${owner.userId}`, { role: 'staff' }, 409)).toBe('LAST_MANAGER');
    // With a second manager, a manager can step down
    const second = await addTeamMember(app, database, owner, { name: 'Second', role: 'manager' });
    await owner.ok('PATCH', `/team/members/${owner.userId}`, { role: 'staff' });
    // ...and now the second one is the last
    expect(await second.refused('PATCH', `/team/members/${second.userId}`, { role: 'staff' }, 409)).toBe(
      'LAST_MANAGER',
    );
  });

  it('changing to the role a person already has does nothing and says nothing in the log', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await owner.ok('PATCH', `/team/members/${staff.userId}`, { role: 'staff' });
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.role_changed')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('writes the activity log with field names only', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await owner.ok('PATCH', `/team/members/${staff.userId}`, { role: 'staff_own' });
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.role_changed')
      .executeTakeFirstOrThrow();
    expect(line.fields).toEqual(['role']);
    expect(line.record_id).toBe(staff.userId);
    expect(JSON.stringify(line)).not.toContain('staff_own');
  });

  it('is for managers only (403), needs a sign-in (401), and answers 404 for a stranger and 400 for a bad request', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const stranger = await signUpOwner(app, database);
    await staff.refused('PATCH', `/team/members/${owner.userId}`, { role: 'staff' }, 403);
    expect(await owner.refused('PATCH', `/team/members/${stranger.userId}`, { role: 'staff' }, 404)).toBe('NOT_FOUND');
    expect(await owner.refused('PATCH', `/team/members/${randomUUID()}`, { role: 'staff' }, 404)).toBe('NOT_FOUND');
    await owner.refused('PATCH', `/team/members/${staff.userId}`, {}, 400);
    await owner.refused('PATCH', `/team/members/${staff.userId}`, { role: 'owner' }, 400);
    await owner.refused('PATCH', `/team/members/${staff.userId}`, { status: 'disabled' }, 400);
    await owner.refused('PATCH', '/team/members/not-an-id', { role: 'staff' }, 400);
    const nobody = await app.inject({
      method: 'PATCH',
      url: `/api/v1/team/members/${staff.userId}`,
      headers: unsafeRequestHeaders,
      payload: { role: 'staff' },
    });
    expect(nobody.statusCode).toBe(401);
  });
});

describe('DELETE /api/v1/team/members/{id}', () => {
  it('removes a person: they cannot use their session any more, and the team list shows them as removed', async () => {
    const { owner, staff } = await businessWithWorkOf();
    await staff.ok('GET', '/me');

    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);

    await staff.refused('GET', '/me', undefined, 401);
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:3000', 'x-requested-with': 'toobler-web' },
      payload: { email: staff.email, password: 'river-lamp-kettle-42' },
    });
    expect(signIn.statusCode).toBeGreaterThanOrEqual(400);
    const team = await owner.ok('GET', '/team');
    expect(team.members.find((member: { id: string }) => member.id === staff.userId)).toMatchObject({
      status: 'disabled',
    });
    // Their sessions are ended in the database too
    const live = await database.system
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', staff.userId)
      .where('revoked_at', 'is', null)
      .execute();
    expect(live).toHaveLength(0);
  });

  it('hands their open leads, tasks, tickets and offerings to the person the manager picked, and leaves won leads alone', async () => {
    const { owner, staff, openLead, wonLead, task, ticket, offering } = await businessWithWorkOf();
    const successor = await addTeamMember(app, database, owner, { name: 'Meera Pillai', role: 'staff' });

    await owner.ok('DELETE', `/team/members/${staff.userId}?hand_over_to=${successor.userId}`, undefined, 204);
    expect(await deliverRemovalEvents(owner.businessId)).toBe(1);

    expect((await owner.ok('GET', `/leads/${openLead.id}`)).ownerUserId).toBe(successor.userId);
    expect((await owner.ok('GET', `/leads/${wonLead.id}`)).ownerUserId).toBe(staff.userId);
    const tasks = await owner.ok('GET', `/tasks?lead_id=${openLead.id}&due=upcoming`);
    expect(tasks.items.find((item: { id: string }) => item.id === task.id).owner.userId).toBe(successor.userId);
    expect(
      (await owner.ok('GET', `/tickets/${ticket.id}`)).owner?.userId ??
        (await owner.ok('GET', `/tickets/${ticket.id}`)).ownerUserId,
    ).toBe(successor.userId);
    const offerings = await owner.ok('GET', '/offerings');
    expect(JSON.stringify(offerings.items.find((item: { id: string }) => item.id === offering.id))).toContain(
      successor.userId,
    );
  });

  it('hands over to the manager who removes them when nobody is named, and the handover is safe to run twice', async () => {
    const { owner, staff, openLead } = await businessWithWorkOf();
    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);
    await deliverRemovalEvents(owner.businessId);
    await deliverRemovalEvents(owner.businessId);
    expect((await owner.ok('GET', `/leads/${openLead.id}`)).ownerUserId).toBe(owner.userId);
  });

  it('stops sharing out new leads to the removed person', async () => {
    const owner = await signUpOwner(app, database);
    const first = await addTeamMember(app, database, owner, { name: 'First', role: 'staff' });
    const second = await addTeamMember(app, database, owner, { name: 'Second', role: 'staff' });
    await owner.ok('PUT', '/assignment-rules', { mode: 'round_robin', userIds: [first.userId, second.userId] });
    await owner.ok('DELETE', `/team/members/${first.userId}?hand_over_to=${second.userId}`, undefined, 204);
    await deliverRemovalEvents(owner.businessId);
    const rules = await owner.ok('GET', '/assignment-rules');
    expect(rules.roundRobinUserIds).toEqual([second.userId]);
  });

  it('refuses removing yourself (409), a hand-over to a removed person or to the person themselves (400) and a stranger (404)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const gone = await addTeamMember(app, database, owner, { name: 'Gone', role: 'staff' });
    const stranger = await signUpOwner(app, database);
    expect(await owner.refused('DELETE', `/team/members/${owner.userId}`, undefined, 409)).toBe('CANNOT_REMOVE_SELF');
    await owner.ok('DELETE', `/team/members/${gone.userId}`, undefined, 204);
    expect(
      await owner.refused('DELETE', `/team/members/${staff.userId}?hand_over_to=${gone.userId}`, undefined, 400),
    ).toBe('INVALID_HAND_OVER');
    expect(
      await owner.refused('DELETE', `/team/members/${staff.userId}?hand_over_to=${staff.userId}`, undefined, 400),
    ).toBe('INVALID_HAND_OVER');
    expect(
      await owner.refused('DELETE', `/team/members/${staff.userId}?hand_over_to=${stranger.userId}`, undefined, 404),
    ).toBe('NOT_FOUND');
    expect(await owner.refused('DELETE', `/team/members/${stranger.userId}`, undefined, 404)).toBe('NOT_FOUND');
    await owner.refused('DELETE', `/team/members/${staff.userId}?hand_over_to=nope`, undefined, 400);
  });

  it('keeps one manager: with two managers each cannot leave the business with none', async () => {
    const owner = await signUpOwner(app, database);
    const second = await addTeamMember(app, database, owner, { name: 'Second', role: 'manager' });
    await owner.ok('DELETE', `/team/members/${second.userId}`, undefined, 204);
    const third = await addTeamMember(app, database, owner, { name: 'Third', role: 'manager' });
    // Two managers removing each other at the same moment: one wins, the other is refused
    const answers = await Promise.all([
      owner.send('DELETE', `/team/members/${third.userId}`),
      third.send('DELETE', `/team/members/${owner.userId}`),
    ]);
    const statuses = answers.map((answer) => answer.statusCode).sort();
    expect(statuses[0]).toBe(204);
    expect([401, 403, 409]).toContain(statuses[1]);
    const active = await database.system
      .selectFrom('users')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('role', '=', 'manager')
      .where('status', '=', 'active')
      .execute();
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it('removing someone already removed does nothing', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);
    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.member_removed')
      .execute();
    expect(lines).toHaveLength(1);
  });

  it('is for managers only (403) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff: TeamMember = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await staff.refused('DELETE', `/team/members/${owner.userId}`, undefined, 403);
    const nobody = await app.inject({
      method: 'DELETE',
      url: `/api/v1/team/members/${staff.userId}`,
      headers: unsafeRequestHeaders,
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('puts only ids in the event, never names or words', async () => {
    const { owner, staff } = await businessWithWorkOf();
    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'team.member_removed')
      .execute();
    expect(Object.keys(events[0]!.payload as object).sort()).toEqual(['handOverToUserId', 'removedBy', 'userId']);
  });
});

describe('adding a removed person back', () => {
  it('lets them sign in again, with the role they had', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await owner.ok('DELETE', `/team/members/${staff.userId}`, undefined, 204);
    expect(await owner.refused('PATCH', `/team/members/${staff.userId}`, { role: 'manager' }, 409)).toBe(
      'MEMBER_REMOVED',
    );

    const restored = await owner.ok('PATCH', `/team/members/${staff.userId}`, { status: 'active' });
    expect(restored).toMatchObject({ status: 'active', role: 'staff' });
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:3000', 'x-requested-with': 'toobler-web' },
      payload: { email: staff.email, password: 'river-lamp-kettle-42' },
    });
    expect(signIn.statusCode, signIn.body).toBe(200);
  });
});
