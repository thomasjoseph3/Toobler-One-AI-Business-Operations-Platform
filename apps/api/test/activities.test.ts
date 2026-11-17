import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// F07 slice 1: notes on a lead (or a person) and the timeline that lists them. Whole stories in pretend browsers that keep cookies like
// real ones, plus the usual refusals (401, 403, 404, 400) and the fence between businesses.

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

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

/** Sends a request and checks it answered with the expected status, returning the body (empty for 204). */
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

/** The status and error code of a request that is expected to be refused. */
async function refused(person: Person, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  return { status: response.statusCode, code: response.json()?.error?.code as string | undefined };
}

/** Adds a contact and a lead for them, returning both ids. */
async function addContactAndLead(person: Person, name: string): Promise<{ contactId: string; leadId: string }> {
  const contact = await sendOk(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
  const lead = await sendOk(
    person,
    'POST',
    '/leads',
    { contactId: contact.id, interest: 'Three nights in December' },
    201,
  );
  return { contactId: contact.id, leadId: lead.id };
}

async function setRole(person: Person, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.userId).execute();
}

/** The log kinds and event names written for one note: that a note was added, never its words. */
async function recordsFor(person: Person, noteId: string) {
  const logs = await database.system
    .selectFrom('activity_log')
    .select(['kind', 'record_type', 'fields'])
    .where('record_id', '=', noteId)
    .execute();
  const events = await database.system
    .selectFrom('domain_events')
    .select(['name', 'payload'])
    .where('account_id', '=', person.businessId)
    .where('name', '=', 'note.added')
    .execute();
  return { logs, events: events.filter((event) => (event.payload as { activityId?: string }).activityId === noteId) };
}

describe('POST /api/v1/notes', () => {
  it('adds a note to a lead as the signed-in person, with their name and role, and writes one log line and one event', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: '  Prefers a ground floor room  ' }, 201);
    expect(note).toMatchObject({
      kind: 'note',
      leadId,
      contactId,
      body: 'Prefers a ground floor room',
      editedAt: null,
      writtenBy: { kind: 'user', userId: owner.userId, name: 'Anita Nair', role: 'manager' },
    });
    const { logs, events } = await recordsFor(owner, note.id);
    expect(logs.map((log) => log.kind)).toEqual(['activities.note_added']);
    expect(JSON.stringify(logs)).not.toContain('ground floor');
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('ground floor');
  });

  it('adds a note to a person, which has no lead', async () => {
    const owner = await signUpAndSignIn();
    const { contactId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { contactId, body: 'Regular guest' }, 201);
    expect(note).toMatchObject({ leadId: null, contactId });
  });

  it('answers 400 for no words, too many words, neither or both of leadId and contactId, an id that is not an id, and fields it does not know', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    const bad: object[] = [
      { leadId, body: '   ' },
      { leadId, body: 'x'.repeat(2001) },
      { body: 'No target' },
      { leadId, contactId, body: 'Two targets' },
      { leadId: 'not-an-id', body: 'x' },
      { leadId, body: 'x', writtenBy: 'someone else' },
      { leadId, body: 'x', accountId: randomUUID() },
    ];
    for (const payload of bad)
      expect((await refused(owner, 'POST', '/notes', payload)).status, JSON.stringify(payload)).toBe(400);
  });

  it('answers 404 for an unknown lead, a deleted lead, another business’s lead and another business’s contact, and saves nothing', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const mine = await addContactAndLead(first, 'Priya Menon');
    const theirs = await addContactAndLead(second, 'Their Guest');
    expect((await refused(first, 'POST', '/notes', { leadId: randomUUID(), body: 'x' })).status).toBe(404);
    expect((await refused(first, 'POST', '/notes', { leadId: theirs.leadId, body: 'x' })).status).toBe(404);
    expect((await refused(first, 'POST', '/notes', { contactId: theirs.contactId, body: 'x' })).status).toBe(404);
    await sendOk(first, 'DELETE', `/leads/${mine.leadId}`, undefined, 204);
    expect((await refused(first, 'POST', '/notes', { leadId: mine.leadId, body: 'x' })).status).toBe(404);
    const stored = await database.system
      .selectFrom('activities')
      .select('id')
      .where('account_id', 'in', [first.businessId, second.businessId])
      .execute();
    expect(stored).toHaveLength(0);
  });

  it('answers 401 when nobody is signed in', async () => {
    const stranger = createPretendBrowser(app);
    const response = await stranger.send('POST', '/api/v1/notes', { leadId: randomUUID(), body: 'x' });
    expect(response.statusCode).toBe(401);
  });

  it('lets staff add notes, and lets the own-leads-only role add notes only to its own leads and never to a person', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    await setRole(owner, 'staff');
    await sendOk(owner, 'POST', '/notes', { leadId, body: 'Staff note' }, 201);
    await setRole(owner, 'staff_own');
    // The lead was given to the owner by the sharing rule, so it is their own
    await sendOk(owner, 'POST', '/notes', { leadId, body: 'Own lead note' }, 201);
    expect((await refused(owner, 'POST', '/notes', { contactId, body: 'x' })).status).toBe(403);
    // Someone else's lead is not theirs to see: 404, like any lead they cannot see
    await database.system.updateTable('leads').set({ owner_user_id: null }).where('id', '=', leadId).execute();
    expect((await refused(owner, 'POST', '/notes', { leadId, body: 'x' })).status).toBe(404);
  });
});

describe('GET /api/v1/activities', () => {
  it('lists a lead’s notes newest first, and a person’s notes include all their leads’', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    // A person can have only one open lead, so the first one is won (straight in the database) before the second is made
    const won = await database.system
      .selectFrom('pipeline_stages')
      .select('id')
      .where('kind', '=', 'won')
      .where('account_id', '=', owner.businessId)
      .executeTakeFirstOrThrow();
    await database.system
      .updateTable('leads')
      .set({ stage_id: won.id, closed_at: new Date() })
      .where('id', '=', leadId)
      .execute();
    const secondLead = (await sendOk(owner, 'POST', '/leads', { contactId, interest: 'Anniversary trip' }, 201)).id;
    const first = await sendOk(owner, 'POST', '/notes', { leadId, body: 'First' }, 201);
    const second = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Second' }, 201);
    const onSecondLead = await sendOk(owner, 'POST', '/notes', { leadId: secondLead, body: 'Other lead' }, 201);
    const onPerson = await sendOk(owner, 'POST', '/notes', { contactId, body: 'About the person' }, 201);

    const leadTimeline = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`);
    expect(leadTimeline.items.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
    expect(leadTimeline.total).toBe(2);

    const personTimeline = await sendOk(owner, 'GET', `/activities?contact_id=${contactId}`);
    expect(personTimeline.items.map((item: { id: string }) => item.id)).toEqual([
      onPerson.id,
      onSecondLead.id,
      second.id,
      first.id,
    ]);
    expect(personTimeline.total).toBe(4);
  });

  it('pages the timeline and narrows it by kind', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    for (const words of ['one', 'two', 'three']) await sendOk(owner, 'POST', '/notes', { leadId, body: words }, 201);
    const pageOne = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&limit=2&page=1`);
    const pageTwo = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&limit=2&page=2`);
    expect(pageOne.items.map((item: { body: string }) => item.body)).toEqual(['three', 'two']);
    expect(pageTwo.items.map((item: { body: string }) => item.body)).toEqual(['one']);
    expect(pageOne.total).toBe(3);
    expect((await sendOk(owner, 'GET', `/activities?lead_id=${leadId}&kind=note`)).total).toBe(3);
  });

  it('shows who wrote each note, also when a colleague wrote one', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const colleagueId = randomUUID();
    await database.system
      .insertInto('users')
      .values({
        id: colleagueId,
        account_id: owner.businessId,
        email: `c-${colleagueId.slice(0, 8)}@example.com`,
        name: 'Rahul Kumar',
        mobile_e164: null,
        mobile_key: null,
        role: 'staff',
      })
      .execute();
    await database.system
      .insertInto('activities')
      .values({
        id: randomUUID(),
        account_id: owner.businessId,
        contact_id: (await sendOk(owner, 'GET', `/leads/${leadId}`)).contactId,
        lead_id: leadId,
        kind: 'note',
        body: 'From Rahul',
        by_user_id: colleagueId,
        by_agent: null,
        created_by: null,
        updated_by: null,
      })
      .execute();
    await sendOk(owner, 'POST', '/notes', { leadId, body: 'From Anita' }, 201);
    const timeline = await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`);
    const writers = timeline.items
      .map((item: { writtenBy: { name: string; role: string } }) => `${item.writtenBy.name}:${item.writtenBy.role}`)
      .sort();
    expect(writers).toEqual(['Anita Nair:manager', 'Rahul Kumar:staff']);
  });

  it('answers 400 unless exactly one of lead_id and contact_id is sent, 404 for an unknown lead or person, 401 and 403 as needed', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    expect((await refused(owner, 'GET', '/activities')).code).toBe('FILTER_NEEDED');
    expect((await refused(owner, 'GET', `/activities?lead_id=${leadId}&contact_id=${contactId}`)).code).toBe(
      'FILTER_NEEDED',
    );
    expect((await refused(owner, 'GET', '/activities?lead_id=nope')).status).toBe(400);
    expect((await refused(owner, 'GET', `/activities?lead_id=${randomUUID()}`)).status).toBe(404);
    expect((await refused(owner, 'GET', `/activities?contact_id=${randomUUID()}`)).status).toBe(404);
    const stranger = createPretendBrowser(app);
    expect((await stranger.send('GET', `/api/v1/activities?lead_id=${leadId}`)).statusCode).toBe(401);
    await setRole(owner, 'staff_own');
    expect((await refused(owner, 'GET', `/activities?contact_id=${contactId}`)).status).toBe(403);
    expect((await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`)).total).toBe(0);
  });

  it('keeps one business’s notes out of another’s', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const mine = await addContactAndLead(first, 'Priya Menon');
    const theirs = await addContactAndLead(second, 'Their Guest');
    await sendOk(first, 'POST', '/notes', { leadId: mine.leadId, body: 'Private words' }, 201);
    expect((await refused(second, 'GET', `/activities?lead_id=${mine.leadId}`)).status).toBe(404);
    expect((await refused(second, 'GET', `/activities?contact_id=${mine.contactId}`)).status).toBe(404);
    expect((await sendOk(second, 'GET', `/activities?lead_id=${theirs.leadId}`)).total).toBe(0);
  });

  it('leaves out a note that was deleted', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Will vanish' }, 201);
    await database.system.updateTable('activities').set({ deleted_at: new Date() }).where('id', '=', note.id).execute();
    expect((await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`)).total).toBe(0);
  });
});

/** Adds a colleague of the business (straight into the database: the team screens come with F02) and a note they wrote on a lead. */
async function addColleagueNote(person: Person, leadId: string, contactId: string) {
  const colleagueId = randomUUID();
  await database.system
    .insertInto('users')
    .values({
      id: colleagueId,
      account_id: person.businessId,
      email: `c-${colleagueId.slice(0, 8)}@example.com`,
      name: 'Rahul Kumar',
      mobile_e164: null,
      mobile_key: null,
      role: 'staff',
    })
    .execute();
  const noteId = randomUUID();
  await database.system
    .insertInto('activities')
    .values({
      id: noteId,
      account_id: person.businessId,
      contact_id: contactId,
      lead_id: leadId,
      kind: 'note',
      body: "Rahul's note",
      by_user_id: colleagueId,
      by_agent: null,
      created_by: null,
      updated_by: null,
    })
    .execute();
  return noteId;
}

describe('PATCH /api/v1/notes/{id}', () => {
  it('changes your own note, marks it edited, and writes one log line and one event without the words', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Prefers ground floor' }, 201);
    const edited = await sendOk(owner, 'PATCH', `/notes/${note.id}`, {
      body: '  Prefers ground floor, near the lift  ',
    });
    expect(edited).toMatchObject({
      id: note.id,
      body: 'Prefers ground floor, near the lift',
      writtenBy: { name: 'Anita Nair' },
    });
    expect(edited.editedAt).not.toBeNull();
    const logs = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', note.id)
      .orderBy('id')
      .execute();
    expect(logs.map((log) => log.kind)).toEqual(['activities.note_added', 'activities.note_edited']);
    const events = await database.system
      .selectFrom('domain_events')
      .select(['name', 'payload'])
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'note.edited')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('near the lift');
    expect((await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`)).items[0].body).toBe(
      'Prefers ground floor, near the lift',
    );
  });

  it('changes nothing, and writes nothing, when the words are the same', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Same words' }, 201);
    const again = await sendOk(owner, 'PATCH', `/notes/${note.id}`, { body: 'Same words' });
    expect(again.editedAt).toBeNull();
    const logs = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', note.id)
      .execute();
    expect(logs.map((log) => log.kind)).toEqual(['activities.note_added']);
  });

  it('answers 403 for a note someone else wrote (even to a manager), and 404 for an unknown, a deleted and another business’s note', async () => {
    const owner = await signUpAndSignIn();
    const stranger = await signUpAndSignIn();
    const { leadId, contactId } = await addContactAndLead(owner, 'Priya Menon');
    const colleaguesNote = await addColleagueNote(owner, leadId, contactId);
    expect((await refused(owner, 'PATCH', `/notes/${colleaguesNote}`, { body: 'Mine now' } as object)).status).toBe(
      403,
    );
    expect((await refused(owner, 'PATCH', `/notes/${randomUUID()}`, { body: 'x' } as object)).status).toBe(404);
    expect((await refused(stranger, 'PATCH', `/notes/${colleaguesNote}`, { body: 'x' } as object)).status).toBe(404);
    const mine = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Will be deleted' }, 201);
    await sendOk(owner, 'DELETE', `/notes/${mine.id}`, undefined, 204);
    expect((await refused(owner, 'PATCH', `/notes/${mine.id}`, { body: 'x' } as object)).status).toBe(404);
    const stored = await database.system
      .selectFrom('activities')
      .select('body')
      .where('id', '=', colleaguesNote)
      .executeTakeFirstOrThrow();
    expect(stored.body).toBe("Rahul's note");
  });

  it('answers 400 for no words, too many, fields it does not know and an id that is not an id, and 401 when nobody is signed in', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Words' }, 201);
    for (const payload of [{ body: '  ' }, { body: 'x'.repeat(2001) }, { body: 'x', leadId: randomUUID() }, {}]) {
      expect(
        (await refused(owner, 'PATCH', `/notes/${note.id}`, payload as object)).status,
        JSON.stringify(payload),
      ).toBe(400);
    }
    expect((await refused(owner, 'PATCH', '/notes/not-an-id', { body: 'x' } as object)).status).toBe(400);
    const stranger = createPretendBrowser(app);
    expect((await stranger.send('PATCH', `/api/v1/notes/${note.id}`, { body: 'x' })).statusCode).toBe(401);
  });

  it('lets the own-leads-only role change its own note while the lead is its own, and answers 404 once it is not', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'First words' }, 201);
    await setRole(owner, 'staff_own');
    await sendOk(owner, 'PATCH', `/notes/${note.id}`, { body: 'Second words' });
    await database.system.updateTable('leads').set({ owner_user_id: null }).where('id', '=', leadId).execute();
    expect((await refused(owner, 'PATCH', `/notes/${note.id}`, { body: 'Third words' } as object)).status).toBe(404);
  });
});

describe('DELETE /api/v1/notes/{id}', () => {
  it('lets a manager delete any note (soft): it leaves every timeline, the row stays, one log line and one event are written', async () => {
    const owner = await signUpAndSignIn();
    const { leadId, contactId } = await addContactAndLead(owner, 'Priya Menon');
    const colleaguesNote = await addColleagueNote(owner, leadId, contactId);
    await sendOk(owner, 'DELETE', `/notes/${colleaguesNote}`, undefined, 204);
    expect((await sendOk(owner, 'GET', `/activities?lead_id=${leadId}`)).total).toBe(0);
    expect((await sendOk(owner, 'GET', `/activities?contact_id=${contactId}`)).total).toBe(0);
    const stored = await database.system
      .selectFrom('activities')
      .select('deleted_at')
      .where('id', '=', colleaguesNote)
      .executeTakeFirstOrThrow();
    expect(stored.deleted_at).not.toBeNull();
    const logs = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', colleaguesNote)
      .execute();
    expect(logs.map((log) => log.kind)).toEqual(['activities.note_deleted']);
    const events = await database.system
      .selectFrom('domain_events')
      .select('name')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'note.deleted')
      .execute();
    expect(events).toHaveLength(1);
  });

  it('answers 404 for an unknown note, a deleted one and another business’s note, 403 to staff, and 401 when nobody is signed in', async () => {
    const owner = await signUpAndSignIn();
    const stranger = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const note = await sendOk(owner, 'POST', '/notes', { leadId, body: 'Words' }, 201);
    const response = async (person: Person, id: string) =>
      (await person.browser.send('DELETE', `/api/v1/notes/${id}`)).statusCode;
    expect(await response(owner, randomUUID())).toBe(404);
    expect(await response(stranger, note.id)).toBe(404);
    await setRole(owner, 'staff');
    expect(await response(owner, note.id)).toBe(403);
    await setRole(owner, 'manager');
    expect(await response(owner, note.id)).toBe(204);
    expect(await response(owner, note.id)).toBe(404);
    expect((await createPretendBrowser(app).send('DELETE', `/api/v1/notes/${note.id}`)).statusCode).toBe(401);
    expect(await response(owner, 'not-an-id')).toBe(400);
  });
});

describe('GET /api/v1/activities/counts', () => {
  it('counts the notes of each asked-about lead, 0 for none, and leaves out deleted notes', async () => {
    const owner = await signUpAndSignIn();
    const first = await addContactAndLead(owner, 'Priya Menon');
    const second = await addContactAndLead(owner, 'Rahul Kumar');
    const third = await addContactAndLead(owner, 'Deepa Kurian');
    await sendOk(owner, 'POST', '/notes', { leadId: first.leadId, body: 'One' }, 201);
    const gone = await sendOk(owner, 'POST', '/notes', { leadId: first.leadId, body: 'Two' }, 201);
    await sendOk(owner, 'POST', '/notes', { leadId: second.leadId, body: 'Three' }, 201);
    await sendOk(owner, 'DELETE', `/notes/${gone.id}`, undefined, 204);
    const answer = await sendOk(
      owner,
      'GET',
      `/activities/counts?lead_ids=${first.leadId},${second.leadId},${third.leadId}`,
    );
    expect(answer.counts).toEqual({ [first.leadId]: 1, [second.leadId]: 1, [third.leadId]: 0 });
  });

  it('counts 0 for an unknown lead, a deleted lead and another business’s lead, so asking tells nothing', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const mine = await addContactAndLead(first, 'Priya Menon');
    const theirs = await addContactAndLead(second, 'Their Guest');
    await sendOk(second, 'POST', '/notes', { leadId: theirs.leadId, body: 'Their private note' }, 201);
    const unknown = randomUUID();
    const answer = await sendOk(first, 'GET', `/activities/counts?lead_ids=${theirs.leadId},${unknown},${mine.leadId}`);
    expect(answer.counts).toEqual({ [theirs.leadId]: 0, [unknown]: 0, [mine.leadId]: 0 });
    await sendOk(first, 'POST', '/notes', { leadId: mine.leadId, body: 'Mine' }, 201);
    await sendOk(first, 'DELETE', `/leads/${mine.leadId}`, undefined, 204);
    expect((await sendOk(first, 'GET', `/activities/counts?lead_ids=${mine.leadId}`)).counts).toEqual({
      [mine.leadId]: 0,
    });
  });

  it('counts only the own leads of the own-leads-only role', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    await sendOk(owner, 'POST', '/notes', { leadId, body: 'A note' }, 201);
    await setRole(owner, 'staff_own');
    expect((await sendOk(owner, 'GET', `/activities/counts?lead_ids=${leadId}`)).counts[leadId]).toBe(1);
    await database.system.updateTable('leads').set({ owner_user_id: null }).where('id', '=', leadId).execute();
    expect((await sendOk(owner, 'GET', `/activities/counts?lead_ids=${leadId}`)).counts[leadId]).toBe(0);
  });

  it('answers 400 for no ids, an id that is not an id, and more than 100 ids, and 401 when nobody is signed in', async () => {
    const owner = await signUpAndSignIn();
    expect((await refused(owner, 'GET', '/activities/counts')).status).toBe(400);
    expect((await refused(owner, 'GET', '/activities/counts?lead_ids=')).status).toBe(400);
    expect((await refused(owner, 'GET', '/activities/counts?lead_ids=nope')).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, () => randomUUID()).join(',');
    expect((await refused(owner, 'GET', `/activities/counts?lead_ids=${tooMany}`)).status).toBe(400);
    expect(
      (await createPretendBrowser(app).send('GET', `/api/v1/activities/counts?lead_ids=${randomUUID()}`)).statusCode,
    ).toBe(401);
  });
});
