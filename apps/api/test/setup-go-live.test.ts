import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// F31 slice 4: the industry's words for the pipeline, and going live.

let database: Database;
let app: FastifyInstance;
const pretendAiCompany = createScriptedLlmProvider(() => ({ answer: 'Hello! How can I help?' }));

beforeAll(async () => {
  database = openTestDatabase();
  const config = { ...testConfig(), ai: { platformKeys: { gemini: [`golive-${randomUUID()}`], openai: [], anthropic: [] } } };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
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

/** A new business (a hotel unless said otherwise) that may use the platform's AI keys. */
async function newBusiness(industry = 'hotel_resort'): Promise<SignedInPerson> {
  const person = await createSignedInPerson(app, database);
  await database.system
    .insertInto('ai_settings')
    .values({ account_id: person.profile.business.id, key_mode: 'platform', platform_enabled: true, platform_expires_at: null, task_models: {} })
    .execute();
  if (industry !== 'hotel_resort') {
    await database.system.updateTable('accounts').set({ industry }).where('id', '=', person.profile.business.id).execute();
  }
  return person;
}

async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

const stageNames = async (person: SignedInPerson) =>
  ((await send(person, 'GET', '/pipeline')).json().stages as Array<{ name: string }>).map((stage) => stage.name);

/** The answers a hotel needs before it can go live. */
const NEEDED_ANSWERS: Record<string, unknown> = {
  has_website: { yes: true, detail: 'https://nairstays.example' },
  business_name: 'Nair Stays',
  business_summary: 'A homestay with six rooms near the beach.',
  address: 'Beach Road, opposite the lighthouse',
  contact_details: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] },
  opening_hours: { allDay: true },
  customer_languages: { choices: ['English', 'Malayalam'] },
};

/** Everything except the last thing: the answers, an offering and the callback promise. Leaves the test chat to the caller. */
async function almostReady(person: SignedInPerson) {
  for (const [key, value] of Object.entries(NEEDED_ANSWERS)) {
    expect((await send(person, 'PUT', `/knowledge/answers/${key}`, { value })).statusCode, key).toBe(200);
  }
  expect((await send(person, 'POST', '/offerings', { name: 'Family room', active: true })).statusCode).toBe(201);
  expect((await send(person, 'PATCH', '/setup', { step: 'promises', status: 'done' })).statusCode).toBe(200);
}

const tryTheAgent = (person: SignedInPerson) => send(person, 'POST', '/agent/test-chat', { message: 'Hello' });

describe('POST /api/v1/setup/apply-preset', () => {
  it("renames the three standard stages to the industry's words, keeps the leads in them, and marks the pipeline step done", async () => {
    const person = await newBusiness('hotel_resort');
    const contact = (await send(person, 'POST', '/contacts', { name: 'Ravi', phone: '+919847012345' })).json();
    await send(person, 'POST', '/leads', { contactId: contact.id });
    const before = (await send(person, 'GET', '/pipeline')).json();
    const idsBefore = before.stages.map((stage: { id: string }) => stage.id);

    const response = await send(person, 'POST', '/setup/apply-preset');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      industry: 'hotel_resort',
      renamedStages: [
        { from: 'New', to: 'New enquiry' },
        { from: 'Contacted', to: 'Called' },
        { from: 'Quoted', to: 'Rate sent' },
      ],
      leftAloneStages: [],
    });
    const after = (await send(person, 'GET', '/pipeline')).json();
    expect(after.stages.map((stage: { name: string }) => stage.name)).toEqual(['New enquiry', 'Called', 'Rate sent', 'Won', 'Lost']);
    expect(after.stages.map((stage: { id: string }) => stage.id)).toEqual(idsBefore); // renamed, not replaced
    expect(after.stages[0].leadCount).toBe(1); // the lead is still in its stage
    const setup = (await send(person, 'GET', '/setup')).json();
    expect(setup.steps.find((step: { key: string }) => step.key === 'pipeline').status).toBe('done');
  });

  it('changes nothing the second time and writes one activity-log line the first time', async () => {
    const person = await newBusiness('clinic');
    await send(person, 'POST', '/setup/apply-preset');
    const second = (await send(person, 'POST', '/setup/apply-preset')).json();
    expect(second).toEqual({ industry: 'clinic', renamedStages: [], leftAloneStages: [] });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'setup.preset_applied')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.fields).toEqual(['clinic', '3']);
  });

  it('leaves alone a stage the owner already renamed', async () => {
    const person = await newBusiness('hotel_resort');
    const stages = (await send(person, 'GET', '/pipeline')).json().stages as Array<{ id: string; name: string }>;
    await send(person, 'PATCH', `/pipeline/stages/${stages[0]!.id}`, { name: 'Fresh leads' });
    const response = (await send(person, 'POST', '/setup/apply-preset')).json();
    expect(response.leftAloneStages).toEqual(['Fresh leads']);
    expect(response.renamedStages.map((rename: { to: string }) => rename.to)).toEqual(['Called', 'Rate sent']);
    expect(await stageNames(person)).toEqual(['Fresh leads', 'Called', 'Rate sent', 'Won', 'Lost']);
  });

  it('keeps the standard words for a general business, but still counts the step as done', async () => {
    const person = await newBusiness('general');
    expect((await send(person, 'POST', '/setup/apply-preset')).json()).toEqual({ industry: 'general', renamedStages: [], leftAloneStages: [] });
    expect(await stageNames(person)).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
    expect((await send(person, 'GET', '/setup')).json().steps.find((step: { key: string }) => step.key === 'pipeline').status).toBe('done');
  });

  it("takes the industry from the business, never from the request, and does not touch another business", async () => {
    const hotel = await newBusiness('hotel_resort');
    const other = await newBusiness('clinic');
    expect((await send(hotel, 'POST', '/setup/apply-preset', { industry: 'clinic' })).statusCode).toBe(200); // the body is ignored
    expect(await stageNames(hotel)).toContain('Rate sent');
    expect(await stageNames(other)).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
  });

  it('answers 401 when nobody is signed in, 403 to staff and without the CSRF header', async () => {
    expect((await send(null, 'POST', '/setup/apply-preset')).statusCode).toBe(401);
    const person = await newBusiness();
    expect((await send(person, 'POST', '/setup/apply-preset', undefined, false)).statusCode).toBe(403);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await send(person, 'POST', '/setup/apply-preset')).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect(await stageNames(person)).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']); // nothing refused changed anything
  });
});

describe('POST /api/v1/setup/go-live', () => {
  it('is refused with 409 NOT_READY and the list of what is missing, and the business stays not live', async () => {
    const person = await newBusiness();
    const response = await send(person, 'POST', '/setup/go-live');
    expect(response.statusCode).toBe(409);
    const error = response.json().error;
    expect(error.code).toBe('NOT_READY');
    expect(error.details.blockers).toEqual(
      expect.arrayContaining([
        { kind: 'question', key: 'business_name' },
        { kind: 'question', key: 'offerings' },
        { kind: 'step', key: 'promises' },
        { kind: 'step', key: 'test_agent' },
      ]),
    );
    expect((await send(person, 'GET', '/setup')).json()).toMatchObject({ isLive: false, liveAt: null });
  });

  it('walks the whole way: blocked until the last thing is done, then goes live once and keeps the first moment', async () => {
    const person = await newBusiness();
    await almostReady(person);
    let setup = (await send(person, 'GET', '/setup')).json();
    expect(setup.blockers).toEqual([{ kind: 'step', key: 'test_agent' }]); // only the test chat is left
    expect((await send(person, 'POST', '/setup/go-live')).statusCode).toBe(409);

    expect((await tryTheAgent(person)).statusCode).toBe(200);
    setup = (await send(person, 'GET', '/setup')).json();
    expect(setup).toMatchObject({ readyToGoLive: true, blockers: [], isLive: false });
    expect(setup.steps.find((step: { key: string }) => step.key === 'test_agent').status).toBe('done');

    const wentLive = await send(person, 'POST', '/setup/go-live');
    expect(wentLive.statusCode, wentLive.body).toBe(200);
    const { liveAt } = wentLive.json();
    expect(new Date(liveAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await send(person, 'GET', '/setup')).json()).toMatchObject({ isLive: true, liveAt });

    // Pressing it again changes nothing
    const again = await send(person, 'POST', '/setup/go-live');
    expect(again.statusCode).toBe(200);
    expect(again.json().liveAt).toBe(liveAt);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'setup.went_live')
      .execute();
    expect(lines).toHaveLength(1);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'business.went_live')
      .execute();
    expect(events).toHaveLength(1);
  });

  it('does not count an answer that is still waiting for a check', async () => {
    const person = await newBusiness();
    await almostReady(person);
    await tryTheAgent(person);
    await database.system
      .updateTable('business_answers')
      .set({ status: 'check', confirmed_at: null, confirmed_by: null, source: 'website' })
      .where('account_id', '=', person.profile.business.id)
      .where('question_key', '=', 'business_name')
      .execute();
    const response = await send(person, 'POST', '/setup/go-live');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.details.blockers).toEqual([{ kind: 'question', key: 'business_name' }]);
  });

  it("does not count another business's test chat, and a chat nobody answered", async () => {
    const person = await newBusiness();
    const stranger = await newBusiness();
    await almostReady(person);
    await tryTheAgent(stranger);
    expect((await send(person, 'POST', '/setup/go-live')).statusCode).toBe(409);
  });

  it('cannot be done by anything else: the settings route refuses to set it, and the owner skipping a step does not help', async () => {
    const person = await newBusiness();
    expect((await send(person, 'PUT', '/knowledge/settings', { liveAt: new Date().toISOString() })).statusCode).toBe(400);
    expect((await send(person, 'PATCH', '/setup', { step: 'test_agent', status: 'done' })).statusCode).toBe(400);
    await send(person, 'PATCH', '/setup', { step: 'promises', status: 'skipped' });
    expect((await send(person, 'GET', '/setup')).json().blockers).toContainEqual({ kind: 'step', key: 'promises' }); // skipped is not done
  });

  it('keeps businesses apart: one going live does not make another live', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    await almostReady(first);
    await tryTheAgent(first);
    expect((await send(first, 'POST', '/setup/go-live')).statusCode).toBe(200);
    expect((await send(second, 'GET', '/setup')).json()).toMatchObject({ isLive: false, liveAt: null });
  });

  it('answers 401 when nobody is signed in, 403 to staff and without the CSRF header', async () => {
    expect((await send(null, 'POST', '/setup/go-live')).statusCode).toBe(401);
    const person = await newBusiness();
    await almostReady(person);
    await tryTheAgent(person);
    expect((await send(person, 'POST', '/setup/go-live', undefined, false)).statusCode).toBe(403);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await send(person, 'POST', '/setup/go-live')).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await send(person, 'GET', '/setup')).json().isLive).toBe(false); // none of the refused calls made it live
  });
});
