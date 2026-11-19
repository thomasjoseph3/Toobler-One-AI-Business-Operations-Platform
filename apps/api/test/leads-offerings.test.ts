import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// F17 slice 6: a lead can name the offering it is about, and new leads can be shared out BY OFFERING.

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

/** Adds a contact and returns its id. */
async function addContact(member: TeamMember, name = 'Priya Menon'): Promise<string> {
  return (await member.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201)).id;
}

/** Adds an offering and returns it. */
const addOffering = (member: TeamMember, fields: object) => member.ok('POST', '/offerings', fields, 201);

/** A business with an owner (manager), a staff member and an "own leads only" person. */
async function buildTeam() {
  const owner = await signUpOwner(app, database);
  const staff = await addTeamMember(app, database, owner, { name: 'Rahul Kumar', role: 'staff' });
  const staffOwn = await addTeamMember(app, database, owner, { name: 'Meera Das', role: 'staff_own' });
  return { owner, staff, staffOwn };
}

describe('a lead names the offering it is about', () => {
  it('shows the offering on the lead, in the list, and can be filtered by it', async () => {
    const { owner } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room' });
    const tour = await addOffering(owner, { name: 'Day tour' });
    const roomLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'Priya'), offeringId: room.id },
      201,
    );
    await owner.ok('POST', '/leads', { contactId: await addContact(owner, 'Karthik'), offeringId: tour.id }, 201);
    await owner.ok('POST', '/leads', { contactId: await addContact(owner, 'Divya') }, 201);
    expect(roomLead.offering).toEqual({ id: room.id, name: 'Family room' });
    expect((await owner.ok('GET', `/leads/${roomLead.id}`)).offering).toEqual({ id: room.id, name: 'Family room' });
    const all = await owner.ok('GET', '/leads');
    expect(all.items.map((lead: { offering: { name: string } | null }) => lead.offering?.name ?? null).sort()).toEqual([
      'Day tour',
      'Family room',
      null,
    ]);
    const aboutTheRoom = await owner.ok('GET', `/leads?offeringId=${room.id}`);
    expect(aboutTheRoom.items.map((lead: { id: string }) => lead.id)).toEqual([roomLead.id]);
    const board = await owner.ok('GET', `/leads?view=board&offeringId=${room.id}`);
    expect(board.columns.reduce((total: number, column: { leadCount: number }) => total + column.leadCount, 0)).toBe(1);
  });

  it('accepts an offering that is switched off, and writes its id (never its name) in the event', async () => {
    const { owner } = await buildTeam();
    const off = await addOffering(owner, { name: 'Winter special', active: false });
    const lead = await owner.ok('POST', '/leads', { contactId: await addContact(owner), offeringId: off.id }, 201);
    expect(lead.offering).toEqual({ id: off.id, name: 'Winter special' });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'lead.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({ leadId: lead.id, offeringId: off.id });
    expect(JSON.stringify(event.payload)).not.toContain('Winter special');
  });

  it("answers 404 for an offering that is unknown, removed or another business's, and 400 for a bad id", async () => {
    const { owner } = await buildTeam();
    const stranger = await signUpOwner(app, database);
    const strangers = await addOffering(stranger, { name: 'Theirs' });
    const gone = await addOffering(owner, { name: 'Gone' });
    await owner.ok('DELETE', `/offerings/${gone.id}`, undefined, 204);
    const contactId = await addContact(owner);
    for (const offeringId of [randomUUID(), strangers.id, gone.id]) {
      await owner.refused('POST', '/leads', { contactId, offeringId }, 404);
    }
    await owner.refused('POST', '/leads', { contactId, offeringId: 'abc' }, 400);
    expect((await owner.ok('GET', '/leads')).total).toBe(0);
  });

  it('can be set, changed and taken away on an existing lead, without handing the lead to someone else', async () => {
    const { owner, staff } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staff.userId });
    const tour = await addOffering(owner, { name: 'Day tour' });
    const lead = await owner.ok('POST', '/leads', { contactId: await addContact(owner) }, 201);
    expect(lead.offering).toBeNull();
    const set = await owner.ok('PATCH', `/leads/${lead.id}`, { offeringId: room.id });
    expect(set.offering).toEqual({ id: room.id, name: 'Family room' });
    expect(set.ownerUserId).toBe(lead.ownerUserId); // naming the offering does not reassign the lead
    expect((await owner.ok('PATCH', `/leads/${lead.id}`, { offeringId: tour.id })).offering.name).toBe('Day tour');
    expect((await owner.ok('PATCH', `/leads/${lead.id}`, { offeringId: null })).offering).toBeNull();
  });

  it('writes one log line with the field name only, and nothing when the same offering is sent again', async () => {
    const { owner } = await buildTeam();
    const room = await addOffering(owner, { name: 'Secret Suite' });
    const lead = await owner.ok('POST', '/leads', { contactId: await addContact(owner) }, 201);
    await owner.ok('PATCH', `/leads/${lead.id}`, { offeringId: room.id });
    await owner.ok('PATCH', `/leads/${lead.id}`, { offeringId: room.id });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .where('kind', '=', 'leads.updated')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.fields).toEqual(['offeringId']);
    expect(JSON.stringify(lines)).not.toContain('Secret Suite');
  });

  it("answers 404 when an existing lead is given an offering that is not the business's own or is removed, and changes nothing", async () => {
    const { owner } = await buildTeam();
    const stranger = await signUpOwner(app, database);
    const strangers = await addOffering(stranger, { name: 'Theirs' });
    const gone = await addOffering(owner, { name: 'Gone' });
    await owner.ok('DELETE', `/offerings/${gone.id}`, undefined, 204);
    const lead = await owner.ok('POST', '/leads', { contactId: await addContact(owner) }, 201);
    for (const offeringId of [randomUUID(), strangers.id, gone.id]) {
      await owner.refused('PATCH', `/leads/${lead.id}`, { offeringId }, 404);
    }
    expect((await owner.ok('GET', `/leads/${lead.id}`)).offering).toBeNull();
  });

  it('keeps showing the offering a lead is about after the offering is removed', async () => {
    const { owner } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room' });
    const lead = await owner.ok('POST', '/leads', { contactId: await addContact(owner), offeringId: room.id }, 201);
    await owner.ok('DELETE', `/offerings/${room.id}`, undefined, 204);
    expect((await owner.ok('GET', `/leads/${lead.id}`)).offering).toEqual({ id: room.id, name: 'Family room' });
    expect((await owner.ok('GET', '/offerings')).items).toHaveLength(0);
  });

  it('lets the "own leads only" person set the offering on their own lead, and filter only their own leads', async () => {
    const { owner, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room' });
    const mine = await staffOwn.ok(
      'POST',
      '/leads',
      { contactId: await addContact(staffOwn, 'Mine'), offeringId: room.id },
      201,
    );
    await owner.ok('POST', '/leads', { contactId: await addContact(owner, 'Not hers'), offeringId: room.id }, 201);
    expect(mine.ownerUserId).toBe(staffOwn.userId);
    const list = await staffOwn.ok('GET', `/leads?offeringId=${room.id}`);
    expect(list.items.map((lead: { id: string }) => lead.id)).toEqual([mine.id]);
  });
});

describe('sharing out new leads by offering', () => {
  it('gives the lead to the person who looks after its offering', async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staff.userId });
    const tour = await addOffering(owner, { name: 'Day tour', ownerUserId: staffOwn.userId });
    const rule = await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: owner.userId });
    expect(rule).toEqual({ mode: 'by_offering', userId: null, fallbackUserId: owner.userId, roundRobinUserIds: [] });
    expect(await owner.ok('GET', '/assignment-rules')).toEqual(rule);

    const roomLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'A'), offeringId: room.id },
      201,
    );
    const tourLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'B'), offeringId: tour.id },
      201,
    );
    expect(roomLead.ownerUserId).toBe(staff.userId);
    expect(tourLead.ownerUserId).toBe(staffOwn.userId);
  });

  it('gives the lead to the fallback person when it names no offering, or its offering has nobody looking after it', async () => {
    const { owner, staff } = await buildTeam();
    const unowned = await addOffering(owner, { name: 'Nobody looks after this' });
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: staff.userId });
    const noOffering = await owner.ok('POST', '/leads', { contactId: await addContact(owner, 'A') }, 201);
    const unownedOffering = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'B'), offeringId: unowned.id },
      201,
    );
    expect(noOffering.ownerUserId).toBe(staff.userId);
    expect(unownedOffering.ownerUserId).toBe(staff.userId);
  });

  it('lets a named owner win over the rule, and keeps the "own leads only" person\'s leads their own', async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staff.userId });
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: owner.userId });
    const named = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'A'), offeringId: room.id, ownerUserId: owner.userId },
      201,
    );
    expect(named.ownerUserId).toBe(owner.userId);
    const hers = await staffOwn.ok(
      'POST',
      '/leads',
      { contactId: await addContact(staffOwn, 'B'), offeringId: room.id },
      201,
    );
    expect(hers.ownerUserId).toBe(staffOwn.userId);
  });

  it("follows the offering's person as it changes, and falls back once nobody looks after it", async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staff.userId });
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: owner.userId });
    const first = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'A'), offeringId: room.id },
      201,
    );
    await owner.ok('PATCH', `/offerings/${room.id}`, { ownerUserId: staffOwn.userId });
    const second = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'B'), offeringId: room.id },
      201,
    );
    await owner.ok('PATCH', `/offerings/${room.id}`, { ownerUserId: null });
    const third = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'C'), offeringId: room.id },
      201,
    );
    expect([first.ownerUserId, second.ownerUserId, third.ownerUserId]).toEqual([
      staff.userId,
      staffOwn.userId,
      owner.userId,
    ]);
  });

  it("is not used by the other two ways of sharing out: one person and round-robin ignore the offering's person", async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staffOwn.userId });
    await owner.ok('PUT', '/assignment-rules', { mode: 'one_person', userId: staff.userId });
    const onePerson = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'A'), offeringId: room.id },
      201,
    );
    expect(onePerson.ownerUserId).toBe(staff.userId);
    await owner.ok('PUT', '/assignment-rules', { mode: 'round_robin', userIds: [owner.userId, staff.userId] });
    const turn = await owner.ok(
      'POST',
      '/leads',
      { contactId: await addContact(owner, 'B'), offeringId: room.id },
      201,
    );
    expect(turn.ownerUserId).toBe(owner.userId);
  });

  it('forgets the fallback when the rule goes back to another way, and the other ways forget nothing they should keep', async () => {
    const { owner, staff } = await buildTeam();
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: staff.userId });
    const back = await owner.ok('PUT', '/assignment-rules', { mode: 'one_person', userId: owner.userId });
    expect(back).toEqual({ mode: 'one_person', userId: owner.userId, fallbackUserId: null, roundRobinUserIds: [] });
    const rule = await database.system
      .selectFrom('assignment_rules')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .executeTakeFirstOrThrow();
    expect(rule).toMatchObject({ mode: 'one_person', user_id: owner.userId });
  });

  it('writes a log line naming the fields, and refuses a fallback person from another business or an unknown one', async () => {
    const { owner } = await buildTeam();
    const stranger = await signUpOwner(app, database);
    await owner.refused('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: stranger.userId }, 404);
    await owner.refused('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: randomUUID() }, 404);
    expect((await owner.ok('GET', '/assignment-rules')).mode).toBe('one_person'); // the old rule is kept
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: owner.userId });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'assignment_rules.replaced')
      .execute();
    expect(lines.at(-1)!.fields).toEqual(['mode', 'fallbackUserId']);
  });

  it('answers 403 to staff and the "own leads only" person who try to set it', async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    for (const person of [staff, staffOwn]) {
      await person.refused('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: person.userId }, 403);
    }
    expect((await owner.ok('GET', '/assignment-rules')).mode).toBe('one_person');
  });

  it('has a database rule that a rule other than round-robin always has its person', async () => {
    const { owner } = await buildTeam();
    await expect(
      database.system
        .updateTable('assignment_rules')
        .set({ mode: 'by_offering', user_id: null })
        .where('account_id', '=', owner.businessId)
        .execute(),
    ).rejects.toThrow();
  });

  it('shares nine leads about two offerings out by offering, even when they are added at the same moment', async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    const room = await addOffering(owner, { name: 'Family room', ownerUserId: staff.userId });
    const tour = await addOffering(owner, { name: 'Day tour', ownerUserId: staffOwn.userId });
    await owner.ok('PUT', '/assignment-rules', { mode: 'by_offering', fallbackUserId: owner.userId });
    const contactIds: string[] = [];
    for (let count = 0; count < 9; count += 1) contactIds.push(await addContact(owner, `Customer ${count}`));
    const responses = await Promise.all(
      contactIds.map((contactId, index) =>
        owner.send('POST', '/leads', {
          contactId,
          ...(index % 3 === 0 ? { offeringId: room.id } : index % 3 === 1 ? { offeringId: tour.id } : {}),
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual(Array(9).fill(201));
    const ownersOf = responses.map((response) => response.json().ownerUserId);
    expect(ownersOf.filter((id) => id === staff.userId)).toHaveLength(3);
    expect(ownersOf.filter((id) => id === staffOwn.userId)).toHaveLength(3);
    expect(ownersOf.filter((id) => id === owner.userId)).toHaveLength(3);
  });
});
