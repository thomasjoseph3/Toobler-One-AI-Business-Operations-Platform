import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// F08 slice 1: adding a task and listing tasks by tab. Whole stories in pretend browsers that keep cookies like real ones, plus the usual
// refusals (401, 403, 404, 400) and the fence between businesses.

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

/** Signs a new owner up and in, with a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/** Sends a request and checks it answered with the expected status, returning the body. */
async function sendOk(person: Person, method: 'GET' | 'POST', url: string, payload?: object, status = 200) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return response.json();
}

/** The status and error code of a request that is expected to be refused. */
async function refused(person: Person, method: 'GET' | 'POST', url: string, payload?: object) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  return { status: response.statusCode, code: response.json()?.error?.code as string | undefined };
}

/** Adds a contact and a lead for them, returning both ids. */
async function addContactAndLead(person: Person, name: string): Promise<{ contactId: string; leadId: string }> {
  const contact = await sendOk(person, 'POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
  const lead = await sendOk(person, 'POST', '/leads', { contactId: contact.id, interest: 'Three nights' }, 201);
  return { contactId: contact.id, leadId: lead.id };
}

/** Changes the signed-in person's role directly in the database (the role screens come with F02). */
async function setRole(person: Person, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.userId).execute();
}

describe('POST /api/v1/tasks', () => {
  it('adds a task on a lead for the signed-in person, with the person, the owner and the tab, one log line and one event', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    const task = await sendOk(
      owner,
      'POST',
      '/tasks',
      { leadId, kind: 'call', title: '  Call Priya at 9  ', dueAt: inHours(48) },
      201,
    );
    expect(task).toMatchObject({
      kind: 'call',
      title: 'Call Priya at 9',
      bucket: 'upcoming',
      doneAt: null,
      leadId,
      contact: { id: contactId, name: 'Priya Menon' },
      owner: { userId: owner.userId, name: 'Anita Nair' },
      createdByAgent: null,
    });
    const logs = await database.system
      .selectFrom('activity_log')
      .select(['kind', 'record_type'])
      .where('record_id', '=', task.id)
      .execute();
    expect(logs).toEqual([{ kind: 'tasks.created', record_type: 'task' }]);
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'task.created')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events) + JSON.stringify(logs)).not.toContain('Call Priya');
  });

  it('is a to-do when no kind is sent, works on a person alone, and can be handed to another person of the business', async () => {
    const owner = await signUpAndSignIn();
    const { contactId } = await addContactAndLead(owner, 'Priya Menon');
    const task = await sendOk(
      owner,
      'POST',
      '/tasks',
      { contactId, title: 'Send the brochure', dueAt: inHours(2) },
      201,
    );
    expect(task).toMatchObject({ kind: 'todo', leadId: null, contact: { id: contactId } });
    // A second person of the same business
    const colleague = await database.system
      .insertInto('users')
      .values({
        id: randomUUID(),
        account_id: owner.businessId,
        name: 'Ravi Kumar',
        email: `ravi-${randomUUID()}@example.com`,
        role: 'staff',
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    const handedOver = await sendOk(
      owner,
      'POST',
      '/tasks',
      { contactId, title: 'Check in', dueAt: inHours(2), ownerUserId: colleague.id },
      201,
    );
    expect(handedOver.owner).toEqual({ userId: colleague.id, name: 'Ravi Kumar' });
  });

  it('answers 400 for no words, too many words, neither or both of leadId and contactId, a bad date, a bad kind and fields it does not know', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    const due = inHours(5);
    const bad: object[] = [
      { leadId, title: '   ', dueAt: due },
      { leadId, title: 'x'.repeat(201), dueAt: due },
      { title: 'No target', dueAt: due },
      { leadId, contactId, title: 'Two targets', dueAt: due },
      { leadId, title: 'x', dueAt: 'tomorrow morning' },
      { leadId, title: 'x' },
      { leadId, title: 'x', dueAt: due, kind: 'meeting' },
      { leadId, title: 'x', dueAt: due, accountId: randomUUID() },
    ];
    for (const payload of bad)
      expect((await refused(owner, 'POST', '/tasks', payload)).status, JSON.stringify(payload)).toBe(400);
  });

  it('answers 404 for an unknown lead, another business’s lead, another business’s contact and an owner who is not in the business, and saves nothing', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const mine = await addContactAndLead(first, 'Priya Menon');
    const theirs = await addContactAndLead(second, 'Their Guest');
    const due = inHours(5);
    expect((await refused(first, 'POST', '/tasks', { leadId: randomUUID(), title: 'x', dueAt: due })).status).toBe(404);
    expect((await refused(first, 'POST', '/tasks', { leadId: theirs.leadId, title: 'x', dueAt: due })).status).toBe(
      404,
    );
    expect(
      (await refused(first, 'POST', '/tasks', { contactId: theirs.contactId, title: 'x', dueAt: due })).status,
    ).toBe(404);
    expect(
      (
        await refused(first, 'POST', '/tasks', {
          leadId: mine.leadId,
          title: 'x',
          dueAt: due,
          ownerUserId: second.userId,
        })
      ).status,
    ).toBe(404);
    const count = await database.system
      .selectFrom('tasks')
      .select('id')
      .where('account_id', '=', first.businessId)
      .execute();
    expect(count).toHaveLength(0);
  });

  it('answers 401 without signing in', async () => {
    const response = await createPretendBrowser(app).send('POST', '/api/v1/tasks', {
      leadId: randomUUID(),
      title: 'x',
      dueAt: inHours(1),
    });
    expect(response.statusCode).toBe(401);
  });

  it('lets the "own leads only" role add tasks only on its own leads and for itself', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    await setRole(owner, 'staff_own');
    // The lead is the owner's own (they created it), so a task for themselves is fine
    await sendOk(owner, 'POST', '/tasks', { leadId, title: 'Mine', dueAt: inHours(1) }, 201);
    // A task on a whole person would reach other people's leads
    expect((await refused(owner, 'POST', '/tasks', { contactId, title: 'x', dueAt: inHours(1) })).status).toBe(403);
    // Handing a task to someone else is for managers and staff
    expect(
      (await refused(owner, 'POST', '/tasks', { leadId, title: 'x', dueAt: inHours(1), ownerUserId: randomUUID() }))
        .status,
    ).toBe(403);
  });
});

describe('GET /api/v1/tasks', () => {
  it('lists one tab at a time with the numbers of all four tabs, soonest first', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Priya Menon');
    const late = await sendOk(owner, 'POST', '/tasks', { leadId, title: 'Late one', dueAt: inHours(1) }, 201);
    const soon = await sendOk(owner, 'POST', '/tasks', { leadId, title: 'Soon one', dueAt: inHours(2) }, 201);
    const later = await sendOk(owner, 'POST', '/tasks', { leadId, title: 'Much later', dueAt: inHours(24 * 5) }, 201);
    // Make the first one overdue and one done directly in the database (the screens for these come in the next slice)
    await database.system
      .updateTable('tasks')
      .set({ due_at: new Date(Date.now() - 3_600_000) })
      .where('id', '=', late.id)
      .execute();
    await database.system.updateTable('tasks').set({ done_at: new Date() }).where('id', '=', soon.id).execute();

    const overdue = await sendOk(owner, 'GET', '/tasks?due=overdue');
    expect(overdue.items.map((item: { title: string }) => item.title)).toEqual(['Late one']);
    expect(overdue.items[0].bucket).toBe('overdue');
    expect(overdue.counts).toEqual({ overdue: 1, today: 0, upcoming: 1, done: 1 });
    const done = await sendOk(owner, 'GET', '/tasks?due=done');
    expect(done.items.map((item: { title: string }) => item.title)).toEqual(['Soon one']);
    expect(done.items[0]).toMatchObject({ bucket: 'done' });
    const upcoming = await sendOk(owner, 'GET', '/tasks?due=upcoming');
    expect(upcoming.items.map((item: { id: string }) => item.id)).toEqual([later.id]);
    // No tab: every open task, soonest first
    const open = await sendOk(owner, 'GET', '/tasks');
    expect(open.items.map((item: { title: string }) => item.title)).toEqual(['Late one', 'Much later']);
    expect(open.total).toBe(2);
  });

  it('narrows by owner, lead and person, and pages', async () => {
    const owner = await signUpAndSignIn();
    const priya = await addContactAndLead(owner, 'Priya Menon');
    const rahul = await addContactAndLead(owner, 'Rahul Shah');
    await sendOk(owner, 'POST', '/tasks', { leadId: priya.leadId, title: 'One', dueAt: inHours(30) }, 201);
    await sendOk(owner, 'POST', '/tasks', { leadId: priya.leadId, title: 'Two', dueAt: inHours(31) }, 201);
    await sendOk(owner, 'POST', '/tasks', { leadId: rahul.leadId, title: 'Three', dueAt: inHours(32) }, 201);
    expect((await sendOk(owner, 'GET', `/tasks?lead_id=${priya.leadId}`)).total).toBe(2);
    expect((await sendOk(owner, 'GET', `/tasks?contact_id=${rahul.contactId}`)).total).toBe(1);
    expect((await sendOk(owner, 'GET', '/tasks?owner=me')).total).toBe(3);
    expect((await sendOk(owner, 'GET', `/tasks?owner=${randomUUID()}`)).total).toBe(0);
    const secondPage = await sendOk(owner, 'GET', '/tasks?limit=2&page=2');
    expect(secondPage.items.map((item: { title: string }) => item.title)).toEqual(['Three']);
    expect(secondPage.total).toBe(3);
  });

  it('answers 400 for a bad tab, a bad owner, a bad limit and both lead_id and contact_id, and 401 without signing in', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    for (const url of [
      '/tasks?due=someday',
      '/tasks?owner=nobody',
      '/tasks?limit=0',
      `/tasks?lead_id=${leadId}&contact_id=${contactId}`,
    ]) {
      expect((await refused(owner, 'GET', url)).status, url).toBe(400);
    }
    expect((await createPretendBrowser(app).send('GET', '/api/v1/tasks')).statusCode).toBe(401);
  });

  it('answers 404 for an unknown lead or person and never shows another business’s tasks', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const mine = await addContactAndLead(first, 'Priya Menon');
    const theirs = await addContactAndLead(second, 'Their Guest');
    await sendOk(
      second,
      'POST',
      '/tasks',
      { leadId: theirs.leadId, title: 'Their secret task', dueAt: inHours(3) },
      201,
    );
    expect((await refused(first, 'GET', `/tasks?lead_id=${randomUUID()}`)).status).toBe(404);
    expect((await refused(first, 'GET', `/tasks?lead_id=${theirs.leadId}`)).status).toBe(404);
    expect((await refused(first, 'GET', `/tasks?contact_id=${theirs.contactId}`)).status).toBe(404);
    const everything = await sendOk(first, 'GET', '/tasks');
    expect(everything.total).toBe(0);
    expect(JSON.stringify(everything)).not.toContain('Their secret task');
    expect(mine.leadId).toBeTruthy();
  });

  it('gives the "own leads only" role only the tasks it owns, and says no to asking for others or for a whole person', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    await sendOk(owner, 'POST', '/tasks', { leadId, title: 'Mine', dueAt: inHours(3) }, 201);
    await database.system
      .insertInto('tasks')
      .values({
        id: randomUUID(),
        account_id: owner.businessId,
        contact_id: contactId,
        lead_id: leadId,
        title: 'Someone else’s',
        due_at: new Date(Date.now() + 3_600_000),
        owner_user_id: (
          await database.system
            .insertInto('users')
            .values({
              id: randomUUID(),
              account_id: owner.businessId,
              name: 'Ravi',
              email: `r-${randomUUID()}@example.com`,
              role: 'staff',
            } as never)
            .returning('id')
            .executeTakeFirstOrThrow()
        ).id,
      } as never)
      .execute();
    expect((await sendOk(owner, 'GET', '/tasks')).total).toBe(2);
    await setRole(owner, 'staff_own');
    const mineOnly = await sendOk(owner, 'GET', '/tasks');
    expect(mineOnly.items.map((item: { title: string }) => item.title)).toEqual(['Mine']);
    expect((await refused(owner, 'GET', `/tasks?owner=${randomUUID()}`)).status).toBe(403);
    expect((await refused(owner, 'GET', `/tasks?contact_id=${contactId}`)).status).toBe(403);
  });
});
