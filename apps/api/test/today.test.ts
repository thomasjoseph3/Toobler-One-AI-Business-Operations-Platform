import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { addTeamMember } from './support/team';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// F22: the Today page read (GET /today?scope=me|team). Each section is built in code from the caller's leads and tasks;
// the "own leads only" role is held to its own, and another business's data never shows (the fence, in isolation.test.ts).

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

async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id };
}

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function sendOk(person: Person, method: 'GET' | 'POST', url: string, payload?: object, status = 200) {
  const response = await person.browser.send(method, `/api/v1${url}`, payload);
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(status);
  return response.json();
}

async function refused(person: Person, method: 'GET' | 'POST', url: string, payload?: object) {
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

/** Sets a lead's temperature straight in the database (the scoring path is tested in F10). */
async function makeLeadHot(leadId: string) {
  await database.system.updateTable('leads').set({ temperature: 'hot' }).where('id', '=', leadId).execute();
}

/** Changes the signed-in person's role straight in the database (the role screens are F02). */
async function setRole(person: Person, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.userId).execute();
}

describe('GET /api/v1/today', () => {
  it('answers with every section and, for a manager, the setup checklist', async () => {
    const owner = await signUpAndSignIn();
    const today = await sendOk(owner, 'GET', '/today');
    expect(today.scope).toBe('me');
    expect(Object.keys(today.sections)).toEqual(['late', 'hot', 'dueToday', 'overnight', 'thisWeek']);
    expect(today.sections.thisWeek).toMatchObject({ leadsIn: expect.any(Number), leadsWon: expect.any(Number) });
    // The owner is a manager, so they see the setup nudge.
    expect(today.setupChecklist).toMatchObject({ unfinishedSteps: expect.any(Number) });
  });

  it('shows a fresh, untouched lead under Overnight and This week, with the contact and phone', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Priya Menon');
    const today = await sendOk(owner, 'GET', '/today');

    const overnight = today.sections.overnight.find((item: { leadId: string }) => item.leadId === leadId);
    expect(overnight, 'the new lead is under Overnight').toBeTruthy();
    expect(overnight).toMatchObject({
      contactId,
      contactName: 'Priya Menon',
      reason: 'new',
      interest: 'Three nights in December',
    });
    expect(overnight.phone).toMatch(/^\+9715/);
    expect(today.sections.thisWeek.leadsIn).toBeGreaterThanOrEqual(1);
  });

  it('shows a hot, untouched lead under Hot', async () => {
    const owner = await signUpAndSignIn();
    const { leadId } = await addContactAndLead(owner, 'Rahul Nair');
    await makeLeadHot(leadId);
    const today = await sendOk(owner, 'GET', '/today');
    expect(today.sections.hot.map((item: { leadId: string }) => item.leadId)).toContain(leadId);
    expect(today.sections.hot[0]).toMatchObject({ temperature: 'hot', reason: 'hot' });
  });

  it('shows a past-due task under Late, with the person to call', async () => {
    const owner = await signUpAndSignIn();
    const { contactId, leadId } = await addContactAndLead(owner, 'Sara Thomas');
    await sendOk(owner, 'POST', '/tasks', { leadId, kind: 'call', title: 'Call Sara back', dueAt: inHours(-2) }, 201);
    const today = await sendOk(owner, 'GET', '/today');
    const late = today.sections.late.tasks.find((task: { contactId: string }) => task.contactId === contactId);
    expect(late, 'the overdue task is under Late').toBeTruthy();
    expect(late).toMatchObject({ title: 'Call Sara back', kind: 'call', leadId });
    expect(late.phone).toMatch(/^\+9715/);
  });

  it('team scope shows a colleague’s lead that the own scope hides', async () => {
    const manager = await signUpAndSignIn();
    const staff = await addTeamMember(
      app,
      database,
      { businessId: manager.businessId },
      { name: 'Deepa Rao', role: 'staff' },
    );
    // The staff member owns a lead of their own.
    const staffContact = await staff.browser.send('POST', '/api/v1/contacts', {
      name: 'Vikram Shah',
      phone: uniqueUaeNumber(),
    });
    const staffContactId = staffContact.json().id;
    const staffLead = await staff.browser.send('POST', '/api/v1/leads', {
      contactId: staffContactId,
      interest: 'A quote',
    });
    const staffLeadId = staffLead.json().id;
    // New leads are shared out by the assignment rule (to the manager by default), so own this one to the staff member
    // on purpose, to prove the scope filter.
    await database.system
      .updateTable('leads')
      .set({ owner_user_id: staff.userId })
      .where('id', '=', staffLeadId)
      .execute();

    const mine = await sendOk(manager, 'GET', '/today?scope=me');
    expect(mine.sections.overnight.map((item: { leadId: string }) => item.leadId)).not.toContain(staffLeadId);

    const team = await sendOk(manager, 'GET', '/today?scope=team');
    const teamItem = team.sections.overnight.find((item: { leadId: string }) => item.leadId === staffLeadId);
    expect(teamItem, "the colleague's lead is in the team view").toBeTruthy();
    expect(teamItem.ownerName).toBe('Deepa Rao');
  });

  it('refuses a signed-out caller, a bad scope, and the own-leads-only role asking for the team', async () => {
    const stranger = createPretendBrowser(app);
    const signedOut = await stranger.send('GET', '/api/v1/today');
    expect(signedOut.statusCode).toBe(401);

    const owner = await signUpAndSignIn();
    expect((await refused(owner, 'GET', '/today?scope=everyone')).status).toBe(400);

    await setRole(owner, 'staff_own');
    expect(await refused(owner, 'GET', '/today?scope=team')).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    // ...but the own-leads-only role may still see its own Today.
    const own = await sendOk(owner, 'GET', '/today');
    expect(own.scope).toBe('me');
  });

  it('does not show the setup checklist to staff', async () => {
    const manager = await signUpAndSignIn();
    const staff = await addTeamMember(
      app,
      database,
      { businessId: manager.businessId },
      { name: 'Nisha Pillai', role: 'staff' },
    );
    const staffPerson: Person = { browser: staff.browser, userId: staff.userId, businessId: staff.businessId };
    const today = await sendOk(staffPerson, 'GET', '/today');
    expect(today.setupChecklist).toBeNull();
  });
});
