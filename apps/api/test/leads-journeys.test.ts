import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// Journey tests for leads and the pipeline: whole stories told as one route after another, in pretend browsers that keep
// cookies like real ones. The other tests check one route at a time; these check that the pipeline, lost reasons, leads,
// contacts, the activity log and the fence between businesses all work TOGETHER.

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

interface Person {
  browser: PretendBrowser;
  userId: string;
  businessId: string;
}

/** Signs a new owner up and in, and gives them a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

/** A phone number nobody else uses: a UAE mobile with random digits. */
const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Sends a request and checks it answered with the expected status, returning the response body (empty for 204). */
async function sendOk(
  person: Person,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  status = 200,
) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return status === 204 ? undefined : response.json();
}

/** Adds a contact and returns its id. */
async function addContact(person: Person, name: string): Promise<string> {
  return (await sendOk(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201)).id;
}

/** The stages of the person's pipeline in board order. */
async function readStages(person: Person) {
  return (await sendOk(person, 'GET', '/pipeline')).stages as Array<{
    id: string;
    name: string;
    kind: string;
    leadCount: number;
  }>;
}

/** The id of the stage with this name. */
async function stageIdNamed(person: Person, name: string): Promise<string> {
  const stage = (await readStages(person)).find((candidate) => candidate.name === name);
  if (!stage) throw new Error(`No stage named ${name}`);
  return stage.id;
}

/** The contact's lifecycle stage. */
async function lifecycleStageOf(person: Person, contactId: string): Promise<string> {
  return (await sendOk(person, 'GET', `/contacts/${contactId}`)).lifecycleStage;
}

/** The activity-log kinds written for one record, oldest first. */
async function activityKindsFor(recordId: string): Promise<string[]> {
  const rows = await database.system
    .selectFrom('activity_log')
    .select('kind')
    .where('record_id', '=', recordId)
    .orderBy('id')
    .execute();
  return rows.map((row) => row.kind);
}

describe('journey: the life of a lead', () => {
  it('set up the board → add a lead → work it → lose it → reopen it → win it → buy again → delete → sign out', async () => {
    const owner = await signUpAndSignIn();

    // A new business starts with the default board and the five lost reasons
    expect((await readStages(owner)).map((stage) => stage.name)).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
    expect((await sendOk(owner, 'GET', '/lost-reasons')).items).toHaveLength(5);

    // The manager makes the board their own: a new stage, new words for Quoted and Won, a new order, their own reasons
    const siteVisit = await sendOk(owner, 'POST', '/pipeline/stages', { name: 'Site visit' }, 201);
    const quotedId = await stageIdNamed(owner, 'Quoted');
    await sendOk(owner, 'PATCH', `/pipeline/stages/${quotedId}`, { name: 'Rate sent' });
    await sendOk(owner, 'PATCH', `/pipeline/stages/${await stageIdNamed(owner, 'Won')}`, { name: 'Booked' });
    const newId = await stageIdNamed(owner, 'New');
    const contactedId = await stageIdNamed(owner, 'Contacted');
    await sendOk(owner, 'POST', '/pipeline/stages/reorder', { stageIds: [newId, contactedId, siteVisit.id, quotedId] });
    expect((await readStages(owner)).map((stage) => stage.name)).toEqual([
      'New',
      'Contacted',
      'Site visit',
      'Rate sent',
      'Booked',
      'Lost',
    ]);
    await sendOk(owner, 'PUT', '/lost-reasons', { reasons: ['Price too high', 'Chose a competitor', 'No answer'] });
    const bookedId = await stageIdNamed(owner, 'Booked');
    const lostId = await stageIdNamed(owner, 'Lost');

    // An enquiry arrives: a contact and a lead for it, owned by the manager, in the first stage
    const contactId = await addContact(owner, 'Priya Menon');
    const lead = await sendOk(
      owner,
      'POST',
      '/leads',
      {
        contactId,
        interest: '3 nights in December, 4 people',
        dateFrom: '2026-12-20',
        dateTo: '2026-12-23',
        partySize: 4,
        budgetPaise: 4_500_000,
      },
      201,
    );
    expect(lead).toMatchObject({
      contact: { name: 'Priya Menon' },
      stage: { name: 'New', kind: 'open' },
      ownerUserId: owner.userId,
      firstChannel: 'manual',
      temperature: 'unscored',
    });
    expect(await lifecycleStageOf(owner, contactId)).toBe('lead');

    // The same person cannot get a second open lead
    const duplicate = await owner.browser.send('POST', '/api/v1/leads', { contactId });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({ code: 'LEAD_OPEN', details: { leadId: lead.id } });

    // The lead shows on the board and in the list
    const board = await sendOk(owner, 'GET', '/leads?view=board');
    expect(board.columns.map((column: { leadCount: number }) => column.leadCount)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(
      (await sendOk(owner, 'GET', `/leads?contactId=${contactId}`)).items.map((item: { id: string }) => item.id),
    ).toEqual([lead.id]);

    // Staff work it: change the details, move it along, and the board and stage counts follow
    await sendOk(owner, 'PATCH', `/leads/${lead.id}`, { interest: 'Wedding in March, 120 guests', partySize: 120 });
    await sendOk(owner, 'POST', `/leads/${lead.id}/move`, { stageId: contactedId });
    await sendOk(owner, 'POST', `/leads/${lead.id}/move`, { stageId: siteVisit.id });
    expect((await readStages(owner)).map((stage) => stage.leadCount)).toEqual([0, 0, 1, 0, 0, 0]);

    // A stage with a lead in it cannot be removed without saying where the lead goes
    const blocked = await owner.browser.send('DELETE', `/api/v1/pipeline/stages/${siteVisit.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toMatchObject({ code: 'STAGE_HAS_LEADS', details: { leadCount: 1 } });
    await sendOk(owner, 'DELETE', `/pipeline/stages/${siteVisit.id}?move_to=${contactedId}`);
    expect((await sendOk(owner, 'GET', `/leads/${lead.id}`)).stage.name).toBe('Contacted');
    expect((await readStages(owner)).map((stage) => stage.name)).toEqual([
      'New',
      'Contacted',
      'Rate sent',
      'Booked',
      'Lost',
    ]);

    // Lose it: a reason is needed, and it must be one of the business's own
    expect(
      (await owner.browser.send('POST', `/api/v1/leads/${lead.id}/move`, { stageId: lostId })).json().error.code,
    ).toBe('LOST_REASON_REQUIRED');
    expect(
      (
        await owner.browser.send('POST', `/api/v1/leads/${lead.id}/move`, { stageId: lostId, lostReason: 'Too costly' })
      ).json().error.code,
    ).toBe('INVALID_LOST_REASON');
    const lost = await sendOk(owner, 'POST', `/leads/${lead.id}/move`, {
      stageId: lostId,
      lostReason: 'price too high',
    });
    expect(lost).toMatchObject({ stage: { kind: 'lost' }, lostReason: 'Price too high' });
    expect(lost.closedAt).not.toBeNull();
    expect(await lifecycleStageOf(owner, contactId)).toBe('new');
    expect((await sendOk(owner, 'GET', '/leads?status=closed')).total).toBe(1);

    // A new lead for her so soon after losing the first is refused: the first should be reopened (rule R6)
    const tooSoon = await owner.browser.send('POST', '/api/v1/leads', { contactId });
    expect(tooSoon.statusCode).toBe(409);
    expect(tooSoon.json().error).toMatchObject({ code: 'LEAD_RECENTLY_LOST', details: { leadId: lead.id } });

    // Reopen it by moving it back into an open stage: the reason and the closing time are cleared
    const reopened = await sendOk(owner, 'POST', `/leads/${lead.id}/move`, { stageId: contactedId });
    expect(reopened).toMatchObject({ closedAt: null, lostReason: null, stage: { name: 'Contacted' } });
    expect(await lifecycleStageOf(owner, contactId)).toBe('lead');

    // Win it: she becomes a customer
    await sendOk(owner, 'POST', `/leads/${lead.id}/move`, { stageId: bookedId });
    expect(await lifecycleStageOf(owner, contactId)).toBe('customer');

    // She comes back to buy again: a new lead is fine after a win, and winning that one makes her a repeat customer
    const secondLead = await sendOk(owner, 'POST', '/leads', { contactId, interest: 'Anniversary trip' }, 201);
    expect(secondLead.id).not.toBe(lead.id);
    expect(await lifecycleStageOf(owner, contactId)).toBe('customer');
    await sendOk(owner, 'POST', `/leads/${secondLead.id}/move`, { stageId: bookedId });
    expect(await lifecycleStageOf(owner, contactId)).toBe('repeat_customer');

    // Deleting the second lead takes her back to a plain customer; it vanishes from the board and the list
    await sendOk(owner, 'DELETE', `/leads/${secondLead.id}`, undefined, 204);
    expect(await lifecycleStageOf(owner, contactId)).toBe('customer');
    expect((await owner.browser.send('GET', `/api/v1/leads/${secondLead.id}`)).statusCode).toBe(404);
    expect(
      (await sendOk(owner, 'GET', `/leads?contactId=${contactId}`)).items.map((item: { id: string }) => item.id),
    ).toEqual([lead.id]);

    // Everything above is in the activity log, with the person who did it and no personal details
    const kinds = await activityKindsFor(lead.id);
    // Five moves by staff (Contacted, Site visit, Lost, Contacted again, Booked). The move caused by removing the Site visit
    // stage is not one of them: it is recorded once, against the stage, as pipeline.stage_removed.
    expect(kinds).toEqual(['leads.created', 'leads.updated', ...Array<string>(5).fill('leads.moved')]);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', lead.id)
      .execute();
    expect(lines.every((line) => (line.actor as { id: string }).id === owner.userId)).toBe(true);
    expect(JSON.stringify(lines)).not.toContain('Priya');

    // After signing out, every leads route answers 401
    expect((await owner.browser.send('POST', '/api/v1/auth/logout')).statusCode).toBe(200);
    expect((await owner.browser.send('GET', '/api/v1/leads')).statusCode).toBe(401);
    expect((await owner.browser.send('GET', '/api/v1/pipeline')).statusCode).toBe(401);
    expect((await owner.browser.send('POST', '/api/v1/leads', { contactId })).statusCode).toBe(401);
    expect((await owner.browser.send('DELETE', `/api/v1/leads/${lead.id}`)).statusCode).toBe(401);
  });
});

describe('journey: two businesses side by side', () => {
  it("one business cannot see, change, move, assign or delete the other's leads, stages or rules", async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();

    // The first business customises its board and adds a lead
    const firstStage = await sendOk(first, 'POST', '/pipeline/stages', { name: 'First only' }, 201);
    await sendOk(first, 'PUT', '/lost-reasons', { reasons: ['Only for the first business'] });
    const contactId = await addContact(first, 'Only for the first business');
    const lead = await sendOk(first, 'POST', '/leads', { contactId, interest: 'Private words' }, 201);

    // The second business sees none of it
    expect((await readStages(second)).map((stage) => stage.name)).not.toContain('First only');
    expect(
      (await sendOk(second, 'GET', '/lost-reasons')).items.map((item: { label: string }) => item.label),
    ).not.toContain('Only for the first business');
    expect((await sendOk(second, 'GET', '/leads')).total).toBe(0);
    expect(
      (await sendOk(second, 'GET', '/leads?view=board')).columns.every(
        (column: { leadCount: number }) => column.leadCount === 0,
      ),
    ).toBe(true);

    // And every route that names the first business's lead, stage, contact or person answers 404 (or changes nothing)
    const secondNewId = await stageIdNamed(second, 'New');
    const attempts: Array<[string, 'GET' | 'POST' | 'PATCH' | 'DELETE', string, object | undefined]> = [
      ['read the lead', 'GET', `/leads/${lead.id}`, undefined],
      ['edit the lead', 'PATCH', `/leads/${lead.id}`, { interest: 'Taken over' }],
      ['move the lead', 'POST', `/leads/${lead.id}/move`, { stageId: secondNewId }],
      ['assign the lead', 'POST', `/leads/${lead.id}/assign`, { ownerUserId: null }],
      ['delete the lead', 'DELETE', `/leads/${lead.id}`, undefined],
      ['rename the stage', 'PATCH', `/pipeline/stages/${firstStage.id}`, { name: 'Hacked' }],
      ['remove the stage', 'DELETE', `/pipeline/stages/${firstStage.id}`, undefined],
      ['add a lead for the contact', 'POST', '/leads', { contactId }],
      [
        'give the lead to the first business owner',
        'POST',
        `/leads/${randomUUID()}/assign`,
        { ownerUserId: first.userId },
      ],
    ];
    for (const [what, method, url, payload] of attempts) {
      const response = await second.browser.send(method, `/api/v1${url}`, payload);
      expect(response.statusCode, `${what}: ${response.body}`).toBe(404);
    }
    // The second business's own lead cannot be given to the first business's person either
    const ownLead = await sendOk(
      second,
      'POST',
      '/leads',
      { contactId: await addContact(second, 'Second business contact') },
      201,
    );
    expect(
      (await second.browser.send('POST', `/api/v1/leads/${ownLead.id}/assign`, { ownerUserId: first.userId }))
        .statusCode,
    ).toBe(404);
    expect(
      (await second.browser.send('PUT', '/api/v1/assignment-rules', { mode: 'one_person', userId: first.userId }))
        .statusCode,
    ).toBe(404);
    // ...nor moved into the first business's stage
    expect(
      (await second.browser.send('POST', `/api/v1/leads/${ownLead.id}/move`, { stageId: firstStage.id })).statusCode,
    ).toBe(404);

    // Nothing changed for the first business
    expect(await sendOk(first, 'GET', `/leads/${lead.id}`)).toMatchObject({
      interest: 'Private words',
      stage: { name: 'New' },
      ownerUserId: first.userId,
    });
    expect((await readStages(first)).map((stage) => stage.name)).toContain('First only');
    expect((await sendOk(first, 'GET', '/leads')).total).toBe(1);
    expect((await sendOk(second, 'GET', '/leads')).total).toBe(1);
  });
});

describe('journey: staff, managers and the sharing-out of new leads', () => {
  /** Adds a second person to the business straight into the database (the team screens come with F02). */
  async function addColleague(person: Person): Promise<string> {
    const userId = randomUUID();
    await database.system
      .insertInto('users')
      .values({
        id: userId,
        account_id: person.businessId,
        email: `colleague-${userId.slice(0, 8)}@example.com`,
        name: 'Rahul Kumar',
        mobile_e164: null,
        mobile_key: null,
        role: 'staff',
      })
      .execute();
    return userId;
  }

  it('staff work the leads but only managers change the board, the reasons, the rules and delete; leads are shared in turn', async () => {
    const person = await signUpAndSignIn();
    const colleagueId = await addColleague(person);
    const contactId = await addContact(person, 'Shared contact');
    const lead = await sendOk(person, 'POST', '/leads', { contactId }, 201);

    // The same person, now ordinary staff (the role is read afresh on every request)
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.userId).execute();
    const stages = await readStages(person);
    const staffCan: Array<[string, 'GET' | 'POST' | 'PATCH', string, object | undefined, number]> = [
      ['read the board', 'GET', '/pipeline', undefined, 200],
      ['read the lost reasons', 'GET', '/lost-reasons', undefined, 200],
      ['list leads', 'GET', '/leads', undefined, 200],
      ['edit a lead', 'PATCH', `/leads/${lead.id}`, { interest: 'Edited by staff' }, 200],
      ['move a lead', 'POST', `/leads/${lead.id}/move`, { stageId: stages[1]!.id }, 200],
      ['assign a lead', 'POST', `/leads/${lead.id}/assign`, { ownerUserId: colleagueId }, 200],
    ];
    for (const [what, method, url, payload, status] of staffCan) {
      const response = await person.browser.send(method, `/api/v1${url}`, payload);
      expect(response.statusCode, `${what}: ${response.body}`).toBe(status);
    }
    const staffCannot: Array<[string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string, object | undefined]> = [
      ['add a stage', 'POST', '/pipeline/stages', { name: 'Not allowed' }],
      ['rename a stage', 'PATCH', `/pipeline/stages/${stages[0]!.id}`, { name: 'Not allowed' }],
      [
        'reorder stages',
        'POST',
        '/pipeline/stages/reorder',
        { stageIds: [stages[0]!.id, stages[1]!.id, stages[2]!.id] },
      ],
      ['remove a stage', 'DELETE', `/pipeline/stages/${stages[2]!.id}`, undefined],
      ['replace the lost reasons', 'PUT', '/lost-reasons', { reasons: ['Not allowed'] }],
      ['read the sharing-out rule', 'GET', '/assignment-rules', undefined],
      ['change the sharing-out rule', 'PUT', '/assignment-rules', { mode: 'one_person', userId: person.userId }],
      ['delete a lead', 'DELETE', `/leads/${lead.id}`, undefined],
    ];
    for (const [what, method, url, payload] of staffCannot) {
      const response = await person.browser.send(method, `/api/v1${url}`, payload);
      expect(response.statusCode, `${what}: ${response.body}`).toBe(403);
    }
    // Nothing the staff member was refused has happened
    expect((await readStages(person)).map((stage) => stage.name)).toEqual([
      'New',
      'Contacted',
      'Quoted',
      'Won',
      'Lost',
    ]);
    expect((await person.browser.send('GET', `/api/v1/leads/${lead.id}`)).statusCode).toBe(200);

    // Back to manager: the board, the rules and the delete now work
    await database.system.updateTable('users').set({ role: 'manager' }).where('id', '=', person.userId).execute();
    await sendOk(person, 'POST', '/pipeline/stages', { name: 'Allowed now' }, 201);

    // Share new leads in turn between the two of them: every second lead goes to the same person, and the turns are even
    const turns = [person.userId, colleagueId];
    const rule = await sendOk(person, 'PUT', '/assignment-rules', { mode: 'round_robin', userIds: turns });
    expect(rule).toEqual({ mode: 'round_robin', userId: null, fallbackUserId: null, roundRobinUserIds: turns });
    const owners: Array<string | null> = [];
    for (let count = 0; count < 6; count += 1) {
      const newLead = await sendOk(
        person,
        'POST',
        '/leads',
        { contactId: await addContact(person, `Enquiry ${count}`) },
        201,
      );
      owners.push(newLead.ownerUserId);
    }
    expect(owners).toEqual([...turns, ...turns, ...turns]);
    expect((await sendOk(person, 'GET', `/leads?ownerUserId=${colleagueId}`)).total).toBe(4); // 3 by turn + the one staff assigned

    // Back to everything going to one person
    await sendOk(person, 'PUT', '/assignment-rules', { mode: 'one_person', userId: colleagueId });
    const lastLead = await sendOk(
      person,
      'POST',
      '/leads',
      { contactId: await addContact(person, 'Last enquiry') },
      201,
    );
    expect(lastLead.ownerUserId).toBe(colleagueId);

    // The manager can delete a lead, and it is gone
    await sendOk(person, 'DELETE', `/leads/${lastLead.id}`, undefined, 204);
    expect((await person.browser.send('GET', `/api/v1/leads/${lastLead.id}`)).statusCode).toBe(404);
  });
});
