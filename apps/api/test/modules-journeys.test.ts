import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { defineModule } from '../src/kernel/module-system/define';
import { buildTestApp } from './support/app';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { TEST_PASSWORD } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';

// Journey tests for modules: whole stories told as one route after another, in pretend browsers that keep cookies like real
// ones. The other module tests check one route at a time; these check that sign-up, the platform's plan, the manager's
// switches, `/me` and the module guard all work TOGETHER.

// A stand-in for a real feature module (follow-ups, later): one route, so we can watch the guard answer 404 or 200.
const probeModule = defineModule({
  id: 'feature.followups',
  kind: 'feature',
  requires: [],
  routes: (moduleApp) => {
    moduleApp.get('/followups-probe', { config: { access: 'staff' } }, async () => ({ ok: true }));
  },
});

let database: Database;
let app: FastifyInstance;
let mail: RecordingMailSender;

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  app = await buildTestApp(database, [probeModule], { mailSender: mail });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

interface Person {
  email: string;
  browser: PretendBrowser;
  businessId: string;
  userId: string;
}

/** Signs a new owner up through the real route, opens the emailed verification link, and signs in. */
async function signUpVerifyAndSignIn(options: { isPlatformAdmin?: boolean } = {}): Promise<Person> {
  const email = `journey-${randomUUID().slice(0, 8)}@example.com`;
  const browser = createPretendBrowser(app);
  const signUp = await browser.send('POST', '/api/v1/auth/signup', {
    name: 'Anita Nair',
    businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
    email,
    mobile: '+91 98470 12345',
    password: TEST_PASSWORD,
    industry: 'hotel_resort',
  });
  expect(signUp.statusCode, signUp.body).toBe(201);
  const verify = await browser.send('POST', '/api/v1/auth/verify-email', { token: mail.latestTokenFor(email) });
  expect(verify.statusCode, verify.body).toBe(200);
  if (options.isPlatformAdmin) {
    // The owner of the product does this with one line of SQL; no route can do it
    await database.system.updateTable('users').set({ is_platform_admin: true }).where('email', '=', email).execute();
  }
  const login = await browser.send('POST', '/api/v1/auth/login', { email, password: TEST_PASSWORD });
  expect(login.statusCode, login.body).toBe(200);
  return { email, browser, businessId: login.json().business.id, userId: login.json().user.id };
}

/** The business's modules as its own manager sees them: module id to state. */
async function readStates(person: Person): Promise<Record<string, string>> {
  const response = await person.browser.send('GET', '/api/v1/modules');
  expect(response.statusCode, response.body).toBe(200);
  return Object.fromEntries(response.json().items.map((item: { id: string; state: string }) => [item.id, item.state]));
}

/** The ids of the modules `/me` lists as active (what the menu would be built from). */
async function readMenuIds(person: Person): Promise<string[]> {
  const response = await person.browser.send('GET', '/api/v1/me');
  expect(response.statusCode, response.body).toBe(200);
  return response.json().activeModules.map((module: { id: string }) => module.id);
}

/** The status of the stand-in module's route for this person: 200 when its module is on, 404 when it is not. */
const probeStatus = async (person: Person) => (await person.browser.send('GET', '/api/v1/followups-probe')).statusCode;

/** The platform admin puts a module in a business's plan, or takes it out. */
const setPlan = (admin: Person, business: Person, moduleId: string, entitled: boolean) =>
  admin.browser.send('POST', `/api/v1/platform/businesses/${business.businessId}/modules`, { moduleId, entitled });

/** The business's manager switches a module on or off. */
const switchModule = (person: Person, moduleId: string, enabled: boolean) =>
  person.browser.send('PATCH', `/api/v1/modules/${moduleId}`, { enabled });

describe('journey: the life of one module in one business', () => {
  it('starts on a new business → platform adds follow-ups → manager switches it on → the engine goes off and takes it along → platform removes it → platform adds it back', async () => {
    const admin = await signUpVerifyAndSignIn({ isPlatformAdmin: true });
    const owner = await signUpVerifyAndSignIn();

    // A new business has the lead engine and the website chat, and nothing else; the follow-ups route does not exist for it
    expect(await readMenuIds(owner)).toEqual(['engine.leads', 'channel.webchat']);
    expect((await readStates(owner))['feature.followups']).toBe('not_in_plan');
    expect(await probeStatus(owner)).toBe(404);

    // The manager cannot give themselves a module that is not in the plan
    const refused = await switchModule(owner, 'feature.followups', true);
    expect(refused.json().error.code).toBe('NOT_IN_PLAN');

    // The platform adds follow-ups to the plan: visible as "off", still not working, not in the menu
    expect((await setPlan(admin, owner, 'feature.followups', true)).statusCode).toBe(200);
    expect((await readStates(owner))['feature.followups']).toBe('off');
    expect(await probeStatus(owner)).toBe(404);
    expect(await readMenuIds(owner)).toEqual(['engine.leads', 'channel.webchat']);

    // The manager switches it on: the route answers, and the menu lists it
    expect((await switchModule(owner, 'feature.followups', true)).statusCode).toBe(200);
    expect(await probeStatus(owner)).toBe(200);
    expect(await readMenuIds(owner)).toEqual(['engine.leads', 'channel.webchat', 'feature.followups']);

    // The manager switches the engine off: follow-ups needs it, so it goes off too; the website chat does not need it
    expect((await switchModule(owner, 'engine.leads', false)).statusCode).toBe(200);
    expect(await probeStatus(owner)).toBe(404);
    expect(await readMenuIds(owner)).toEqual(['channel.webchat']);
    const needsEngine = await switchModule(owner, 'feature.followups', true);
    expect(needsEngine.json().error).toMatchObject({ code: 'NEEDS_MODULE', details: { moduleId: 'engine.leads' } });

    // Engine back on, then follow-ups back on (it did not switch itself on)
    await switchModule(owner, 'engine.leads', true);
    expect(await probeStatus(owner)).toBe(404);
    await switchModule(owner, 'feature.followups', true);
    expect(await probeStatus(owner)).toBe(200);

    // The platform takes follow-ups out of the plan: gone at once, and the manager cannot bring it back
    expect((await setPlan(admin, owner, 'feature.followups', false)).statusCode).toBe(200);
    expect(await probeStatus(owner)).toBe(404);
    expect((await readStates(owner))['feature.followups']).toBe('not_in_plan');
    expect((await switchModule(owner, 'feature.followups', true)).json().error.code).toBe('NOT_IN_PLAN');

    // Adding it back puts it in the plan switched OFF: the business decides again
    await setPlan(admin, owner, 'feature.followups', true);
    expect((await readStates(owner))['feature.followups']).toBe('off');
    expect(await probeStatus(owner)).toBe(404);

    // Everything above left a trail in the activity log, in the business's name
    const logKinds = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', owner.businessId)
      .where('kind', 'like', 'modules.%')
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    expect(new Set(logKinds.map((line) => line.kind))).toEqual(
      new Set(['modules.entitled', 'modules.enabled', 'modules.disabled', 'modules.unentitled']),
    );
  });
});

describe('journey: staff and signing out', () => {
  it('staff can see the modules but not change them, and nobody sees anything after signing out', async () => {
    const owner = await signUpVerifyAndSignIn();
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', owner.userId).execute();

    expect((await readStates(owner))['engine.leads']).toBe('active');
    expect(await readMenuIds(owner)).toEqual(['engine.leads', 'channel.webchat']);
    expect((await switchModule(owner, 'channel.webchat', false)).statusCode).toBe(403);
    expect((await readStates(owner))['channel.webchat']).toBe('active');

    expect((await owner.browser.send('POST', '/api/v1/auth/logout')).statusCode).toBe(200);
    expect((await owner.browser.send('GET', '/api/v1/modules')).statusCode).toBe(401);
    expect((await owner.browser.send('GET', '/api/v1/followups-probe')).statusCode).toBe(401);
  });

  it('a manager cannot use the platform route on their own business or anyone elses', async () => {
    const owner = await signUpVerifyAndSignIn();
    const other = await signUpVerifyAndSignIn();
    const forSelf = await setPlan(owner, owner, 'feature.followups', true);
    const forOther = await setPlan(owner, other, 'feature.followups', true);
    expect(forSelf.statusCode).toBe(403);
    expect(forOther.statusCode).toBe(403);
    expect((await readStates(owner))['feature.followups']).toBe('not_in_plan');
    expect((await readStates(other))['feature.followups']).toBe('not_in_plan');
  });
});

describe('journey: two businesses side by side', () => {
  it("one business's plan and switches never change the other's", async () => {
    const admin = await signUpVerifyAndSignIn({ isPlatformAdmin: true });
    const first = await signUpVerifyAndSignIn();
    const second = await signUpVerifyAndSignIn();

    await setPlan(admin, first, 'feature.followups', true);
    await switchModule(first, 'feature.followups', true);
    expect(await probeStatus(first)).toBe(200);
    expect(await probeStatus(second)).toBe(404);
    expect((await readStates(second))['feature.followups']).toBe('not_in_plan');
    expect((await switchModule(second, 'feature.followups', true)).json().error.code).toBe('NOT_IN_PLAN');

    // The second business switches its own website chat off: the first one is untouched
    await switchModule(second, 'channel.webchat', false);
    expect(await readMenuIds(second)).toEqual(['engine.leads']);
    expect(await readMenuIds(first)).toEqual(['engine.leads', 'channel.webchat', 'feature.followups']);

    // The platform takes the engine from the first business: only the first one loses it
    await setPlan(admin, first, 'engine.leads', false);
    expect(await probeStatus(first)).toBe(404);
    expect(await readMenuIds(first)).toEqual(['channel.webchat']);
    expect(await readMenuIds(second)).toEqual(['engine.leads']);
  });
});
