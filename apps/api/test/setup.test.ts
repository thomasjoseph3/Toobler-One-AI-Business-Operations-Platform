import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

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

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'PUT' | 'POST' | 'PATCH',
  url: string,
  payload?: unknown,
  withCsrf = true,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(withCsrf ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

const getSetup = (person: SignedInPerson | null) => send(person, 'GET', '/setup');
const markStep = (person: SignedInPerson | null, step: unknown, status: unknown, withCsrf = true) =>
  send(person, 'PATCH', '/setup', { step, status }, withCsrf);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** The status of one step in a setup answer. */
const statusOf = (body: { steps: Array<{ key: string; status: string }> }, key: string) =>
  body.steps.find((step) => step.key === key)?.status;

/** The questions "About your business" needs before going live, with good answers. */
const ABOUT_BUSINESS_ANSWERS: Record<string, unknown> = {
  business_name: 'Nair Stays',
  business_summary: 'A homestay with six rooms near the beach.',
  address: 'Beach Road, opposite the lighthouse',
  contact_details: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] },
  opening_hours: { allDay: true },
  customer_languages: { choices: ['English', 'Malayalam'] },
};

describe('GET /api/v1/setup', () => {
  it('gives a new business every step as todo, 0 percent, and what still stops it going live', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await getSetup(person);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.steps.map((step: { key: string }) => step.key)).toEqual([
      'website',
      'about_business',
      'what_you_sell',
      'situations',
      'goals',
      'promises',
      'pipeline',
      'team',
      'channels',
      'test_agent',
    ]);
    expect(body.steps.every((step: { status: string }) => step.status === 'todo')).toBe(true);
    expect(body.steps.find((step: { key: string }) => step.key === 'about_business')).toMatchObject({
      part: 1,
      checkedBySystem: true,
    });
    expect(body.steps.find((step: { key: string }) => step.key === 'pipeline')).toMatchObject({
      part: 2,
      checkedBySystem: false,
    });
    expect(body.percentDone).toBe(0);
    expect(body.readyToGoLive).toBe(false);
    expect(body.isLive).toBe(false);
    expect(body.liveAt).toBeNull();
    expect(body.blockers).toEqual(
      expect.arrayContaining([
        { kind: 'question', key: 'business_name' },
        { kind: 'step', key: 'promises' },
        { kind: 'step', key: 'test_agent' },
      ]),
    );
    expect(body.neededToGoLiveStillMissing).toContain('business_name');
    expect(body.neededToGoLiveStillMissing).toContain('offerings');
  });

  it('works out "About your business" and "What you sell" from the answers and the offerings', async () => {
    const person = await createSignedInPerson(app, database);
    for (const [key, value] of Object.entries(ABOUT_BUSINESS_ANSWERS)) {
      const answered = await send(person, 'PUT', `/knowledge/answers/${key}`, { value });
      expect(answered.statusCode, answered.body).toBe(200);
    }
    const afterAnswers = (await getSetup(person)).json();
    expect(statusOf(afterAnswers, 'about_business')).toBe('done');
    expect(statusOf(afterAnswers, 'what_you_sell')).toBe('todo');

    const offering = (await send(person, 'POST', '/offerings', { name: 'Family room', active: true })).json();
    expect(offering.id).toBeTruthy();
    const afterOffering = (await getSetup(person)).json();
    expect(statusOf(afterOffering, 'what_you_sell')).toBe('done');
    expect(afterOffering.percentDone).toBe(20); // 2 of 10 steps
  });

  it('does not count a typed answer that is still waiting for a check', async () => {
    const person = await createSignedInPerson(app, database);
    for (const [key, value] of Object.entries(ABOUT_BUSINESS_ANSWERS)) {
      await send(person, 'PUT', `/knowledge/answers/${key}`, { value });
    }
    // The system fills in an answer later (F31); until a manager confirms it, it must not count
    await database.system
      .updateTable('business_answers')
      .set({ status: 'check', confirmed_at: null, confirmed_by: null })
      .where('account_id', '=', person.profile.business.id)
      .where('question_key', '=', 'business_name')
      .execute();
    expect(statusOf((await getSetup(person)).json(), 'about_business')).toBe('todo');
  });

  it('answers 401 when nobody is signed in, and 403 to staff', async () => {
    expect((await getSetup(null)).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await getSetup(person)).statusCode, role).toBe(403);
    }
  });

  it("shows only the caller's own business", async () => {
    const anita = await createSignedInPerson(app, database);
    const bob = await createSignedInPerson(app, database);
    await markStep(anita, 'pipeline', 'done');
    expect(statusOf((await getSetup(anita)).json(), 'pipeline')).toBe('done');
    expect(statusOf((await getSetup(bob)).json(), 'pipeline')).toBe('todo');
  });
});

describe('PATCH /api/v1/setup', () => {
  it('marks a step done, skipped and todo again, and answers with the whole picture', async () => {
    const person = await createSignedInPerson(app, database);
    const done = await markStep(person, 'pipeline', 'done');
    expect(done.statusCode, done.body).toBe(200);
    expect(statusOf(done.json(), 'pipeline')).toBe('done');
    expect(done.json().percentDone).toBe(10);

    const skipped = (await markStep(person, 'pipeline', 'skipped')).json();
    expect(statusOf(skipped, 'pipeline')).toBe('skipped');
    expect(skipped.percentDone).toBe(0); // a skipped step is not a done step

    const again = (await markStep(person, 'pipeline', 'todo')).json();
    expect(statusOf(again, 'pipeline')).toBe('todo');
    // One row per step, however many times it changed
    const rows = await database.system
      .selectFrom('setup_steps')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('writes one activity-log line per real change, and none when nothing changes', async () => {
    const person = await createSignedInPerson(app, database);
    await markStep(person, 'team', 'skipped');
    await markStep(person, 'team', 'skipped'); // the same again: nothing changes
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'setup.step_marked')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ record_type: 'setup_step', fields: ['team', 'skipped'] });
  });

  it('refuses a step the system checks itself with 400 STEP_CHECKED_BY_SYSTEM, and saves nothing', async () => {
    const person = await createSignedInPerson(app, database);
    for (const step of ['about_business', 'what_you_sell', 'test_agent']) {
      const response = await markStep(person, step, 'done');
      expect(response.statusCode, step).toBe(400);
      expect(response.json().error.code).toBe('STEP_CHECKED_BY_SYSTEM');
    }
    const rows = await database.system
      .selectFrom('setup_steps')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('answers 400 for an unknown step, an unknown status, a missing field and an extra field', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await markStep(person, 'no_such_step', 'done')).statusCode).toBe(400);
    expect((await markStep(person, 'pipeline', 'finished')).statusCode).toBe(400);
    expect((await send(person, 'PATCH', '/setup', { step: 'pipeline' })).statusCode).toBe(400);
    expect((await send(person, 'PATCH', '/setup', { step: 'pipeline', status: 'done', extra: 1 })).statusCode).toBe(400);
  });

  it('answers 401 when nobody is signed in, 403 to staff, and refuses a request without the CSRF header', async () => {
    expect((await markStep(null, 'pipeline', 'done')).statusCode).toBe(401);
    const person = await createSignedInPerson(app, database);
    expect((await markStep(person, 'pipeline', 'done', false)).statusCode).toBe(403);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await markStep(person, 'pipeline', 'done')).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect(statusOf((await getSetup(person)).json(), 'pipeline')).toBe('todo'); // none of the refused calls saved anything
  });

  it('cannot be aimed at another business: the business comes from the session', async () => {
    const anita = await createSignedInPerson(app, database);
    const bob = await createSignedInPerson(app, database);
    const response = await send(bob, 'PATCH', '/setup', {
      step: 'pipeline',
      status: 'done',
      accountId: anita.profile.business.id,
    });
    expect(response.statusCode).toBe(400); // an extra field is refused
    await markStep(bob, 'pipeline', 'done');
    expect(statusOf((await getSetup(anita)).json(), 'pipeline')).toBe('todo');
  });

  it('cannot change or delete a saved step row except its status (the database refuses)', async () => {
    const person = await createSignedInPerson(app, database);
    await markStep(person, 'goals', 'done');
    const accountId = person.profile.business.id;
    await expect(
      database.runInAccountTransaction(accountId, (transaction) =>
        transaction.deleteFrom('setup_steps').where('account_id', '=', accountId).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
