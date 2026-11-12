import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
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

/** Reads the pipeline as the person (or as nobody). */
const getPipeline = (person: SignedInPerson | null) =>
  app.inject({ url: '/api/v1/pipeline', headers: person ? { cookie: person.cookieHeader } : {} });

/** Adds a stage as the person, with the headers the web app sends. */
const addStage = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/pipeline/stages',
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Makes the person ordinary staff (their role is read from the database on every request). */
async function makeStaff(person: SignedInPerson) {
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', person.profile.user.id).execute();
}

/** The stage names of a pipeline answer, in the order they came. */
const stageNames = (body: { stages: Array<{ name: string }> }) => body.stages.map((stage) => stage.name);

describe('GET /api/v1/pipeline', () => {
  it('gives a new business the default stages in order, with no leads yet', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await getPipeline(person);
    expect(response.statusCode, response.body).toBe(200);
    const pipeline = response.json();
    expect(pipeline.name).toBe('Sales pipeline');
    expect(stageNames(pipeline)).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
    expect(pipeline.stages.map((stage: { kind: string }) => stage.kind)).toEqual([
      'open',
      'open',
      'open',
      'won',
      'lost',
    ]);
    expect(pipeline.stages.map((stage: { sort: number }) => stage.sort)).toEqual([0, 1, 2, 3, 4]);
    expect(pipeline.stages.every((stage: { leadCount: number }) => stage.leadCount === 0)).toBe(true);
  });

  it('also gives the new business its lost reasons and the rule "new leads go to the owner"', async () => {
    const person = await createSignedInPerson(app, database);
    const accountId = person.profile.business.id;
    const reasons = await database.system
      .selectFrom('lost_reasons')
      .select('label')
      .where('account_id', '=', accountId)
      .orderBy('sort')
      .execute();
    expect(reasons.map((reason) => reason.label)).toEqual([
      'Too costly',
      'Went elsewhere',
      'Dates not available',
      'No reply',
      'Other',
    ]);
    const rule = await database.system
      .selectFrom('assignment_rules')
      .select(['mode', 'user_id'])
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow();
    expect(rule).toEqual({ mode: 'one_person', user_id: person.profile.user.id });
  });

  it('counts the leads in each stage and ignores deleted leads', async () => {
    const person = await createSignedInPerson(app, database);
    const accountId = person.profile.business.id;
    const contactId = randomUUID();
    await database.system
      .insertInto('contacts')
      .values({
        id: contactId,
        account_id: accountId,
        name: 'Priya',
        phone: null,
        email: `${contactId}@example.com`,
        language: null,
      })
      .execute();
    const newStage = await database.system
      .selectFrom('pipeline_stages')
      .select('id')
      .where('account_id', '=', accountId)
      .where('name', '=', 'New')
      .executeTakeFirstOrThrow();
    for (const deleted of [false, false, true]) {
      await database.system
        .insertInto('leads')
        .values({
          id: randomUUID(),
          account_id: accountId,
          contact_id: contactId,
          stage_id: newStage.id,
          ...(deleted ? { deleted_at: new Date() } : {}),
        })
        .execute();
    }
    const pipeline = (await getPipeline(person)).json();
    expect(pipeline.stages.find((stage: { name: string }) => stage.name === 'New').leadCount).toBe(2);
    expect(pipeline.stages.find((stage: { name: string }) => stage.name === 'Quoted').leadCount).toBe(0);
  });

  it("never shows another business's stages", async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addStage(first, { name: 'Site visit' });
    expect(stageNames((await getPipeline(second)).json())).not.toContain('Site visit');
    expect(stageNames((await getPipeline(first)).json())).toContain('Site visit');
  });

  it('answers 401 when nobody is signed in', async () => {
    expect((await getPipeline(null)).statusCode).toBe(401);
  });

  it('lets ordinary staff read it', async () => {
    const person = await createSignedInPerson(app, database);
    await makeStaff(person);
    expect((await getPipeline(person)).statusCode).toBe(200);
  });
});

describe('POST /api/v1/pipeline/stages', () => {
  it('adds an open stage just before Won, and Won and Lost stay last', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addStage(person, { name: '  Site visit  ' });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Site visit', kind: 'open', sort: 3, leadCount: 0 });
    expect(response.json().id).toMatch(/^[0-9a-f-]{36}$/);

    const pipeline = (await getPipeline(person)).json();
    expect(stageNames(pipeline)).toEqual(['New', 'Contacted', 'Quoted', 'Site visit', 'Won', 'Lost']);
    expect(pipeline.stages.map((stage: { sort: number }) => stage.sort)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('adds several stages in the order they were added', async () => {
    const person = await createSignedInPerson(app, database);
    await addStage(person, { name: 'First' });
    await addStage(person, { name: 'Second' });
    expect(stageNames((await getPipeline(person)).json())).toEqual([
      'New',
      'Contacted',
      'Quoted',
      'First',
      'Second',
      'Won',
      'Lost',
    ]);
  });

  it('takes turns when two stages are added at the same moment (no two stages share a place)', async () => {
    const person = await createSignedInPerson(app, database);
    const responses = await Promise.all([addStage(person, { name: 'Left' }), addStage(person, { name: 'Right' })]);
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    const sorts = (await getPipeline(person)).json().stages.map((stage: { sort: number }) => stage.sort);
    expect(sorts).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('refuses a second stage with the same name, ignoring capitals', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await addStage(person, { name: 'Site visit' })).statusCode).toBe(201);
    const duplicate = await addStage(person, { name: 'SITE VISIT' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('STAGE_EXISTS');
    // Won and Lost cannot be added a second time either
    expect((await addStage(person, { name: 'won' })).statusCode).toBe(409);
  });

  it('allows the same stage name in two different businesses', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    expect((await addStage(first, { name: 'Site visit' })).statusCode).toBe(201);
    expect((await addStage(second, { name: 'Site visit' })).statusCode).toBe(201);
  });

  it('stops at twelve open stages', async () => {
    const person = await createSignedInPerson(app, database);
    for (let position = 4; position <= 12; position += 1) {
      expect((await addStage(person, { name: `Stage ${position}` })).statusCode).toBe(201);
    }
    const tooMany = await addStage(person, { name: 'One too many' });
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error.code).toBe('TOO_MANY_STAGES');
  });

  it('records who did it, in the activity log and the outbox, without the stage name', async () => {
    const person = await createSignedInPerson(app, database);
    const stageId = (await addStage(person, { name: 'Secret-stage-name' })).json().id;
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', stageId)
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({
      kind: 'pipeline.stage_added',
      record_type: 'pipeline_stage',
      fields: ['name'],
      actor: { kind: 'user', id: person.profile.user.id },
    });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'pipeline.stage_added')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ stageId });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-stage-name');
    const stored = await database.system
      .selectFrom('pipeline_stages')
      .select(['created_by', 'updated_by'])
      .where('id', '=', stageId)
      .executeTakeFirstOrThrow();
    expect(stored.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('answers 401 when nobody is signed in', async () => {
    expect((await addStage(null, { name: 'Site visit' })).statusCode).toBe(401);
  });

  it('answers 403 to ordinary staff, and adds nothing', async () => {
    const person = await createSignedInPerson(app, database);
    await makeStaff(person);
    expect((await addStage(person, { name: 'Site visit' })).statusCode).toBe(403);
    expect(stageNames((await getPipeline(person)).json())).not.toContain('Site visit');
  });

  it('answers 403 without the web app headers (the CSRF check)', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await addStage(person, { name: 'Site visit' }, false)).statusCode).toBe(403);
  });

  it('answers 400 for a missing, blank, too long or unknown field', async () => {
    const person = await createSignedInPerson(app, database);
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { name: 5 }]) {
      expect((await addStage(person, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    // The business and the kind come from the session and the system, never from the request
    expect((await addStage(person, { name: 'Site visit', kind: 'won' })).statusCode).toBe(400);
    expect((await addStage(person, { name: 'Site visit', accountId: randomUUID() })).statusCode).toBe(400);
  });
});

/** Renames a stage as the person. */
const renameStage = (person: SignedInPerson | null, stageId: string, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/pipeline/stages/${stageId}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** Reorders the open stages as the person. */
const reorderStages = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/pipeline/stages/reorder',
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    payload: body as object,
  });

/** The stages of the person's pipeline (id, name, kind), in board order. */
async function readStages(person: SignedInPerson) {
  return (await getPipeline(person)).json().stages as Array<{ id: string; name: string; kind: string; sort: number }>;
}

describe('PATCH /api/v1/pipeline/stages/{id}', () => {
  it('renames an open stage and keeps its place and kind', async () => {
    const person = await createSignedInPerson(app, database);
    const quoted = (await readStages(person)).find((stage) => stage.name === 'Quoted')!;
    const response = await renameStage(person, quoted.id, { name: '  Price sent  ' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ id: quoted.id, name: 'Price sent', kind: 'open', sort: 2, leadCount: 0 });
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Contacted', 'Price sent', 'Won', 'Lost']);
  });

  it('lets Won and Lost be renamed, and they keep their meaning', async () => {
    const person = await createSignedInPerson(app, database);
    const stages = await readStages(person);
    const won = stages.find((stage) => stage.kind === 'won')!;
    const response = await renameStage(person, won.id, { name: 'Booked' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Booked', kind: 'won', sort: 3 });
  });

  it('accepts the stage keeping its own name, with other capitals', async () => {
    const person = await createSignedInPerson(app, database);
    const contacted = (await readStages(person)).find((stage) => stage.name === 'Contacted')!;
    expect((await renameStage(person, contacted.id, { name: 'CONTACTED' })).statusCode).toBe(200);
  });

  it('refuses a name another stage already has, ignoring capitals', async () => {
    const person = await createSignedInPerson(app, database);
    const contacted = (await readStages(person)).find((stage) => stage.name === 'Contacted')!;
    const response = await renameStage(person, contacted.id, { name: 'quoted' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('STAGE_EXISTS');
    expect(stageNames((await getPipeline(person)).json())).toContain('Contacted');
  });

  it('counts the stage leads in its answer', async () => {
    const person = await createSignedInPerson(app, database);
    const accountId = person.profile.business.id;
    const contactId = randomUUID();
    await database.system
      .insertInto('contacts')
      .values({
        id: contactId,
        account_id: accountId,
        name: null,
        phone: null,
        email: `${contactId}@example.com`,
        language: null,
      })
      .execute();
    const newStage = (await readStages(person)).find((stage) => stage.name === 'New')!;
    await database.system
      .insertInto('leads')
      .values({ id: randomUUID(), account_id: accountId, contact_id: contactId, stage_id: newStage.id })
      .execute();
    expect((await renameStage(person, newStage.id, { name: 'Fresh' })).json().leadCount).toBe(1);
  });

  it("answers 404 for another business's stage, and changes nothing there", async () => {
    const owner = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const ownersStage = (await readStages(owner))[0]!;
    expect((await renameStage(stranger, ownersStage.id, { name: 'Hacked' })).statusCode).toBe(404);
    expect(stageNames((await getPipeline(owner)).json())).not.toContain('Hacked');
  });

  it('answers 404 for an unknown id and 400 for an id that is not a UUID', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await renameStage(person, randomUUID(), { name: 'Anything' })).statusCode).toBe(404);
    expect((await renameStage(person, 'not-a-uuid', { name: 'Anything' })).statusCode).toBe(400);
  });

  it('records who did it, without the new name', async () => {
    const person = await createSignedInPerson(app, database);
    const quoted = (await readStages(person)).find((stage) => stage.name === 'Quoted')!;
    await renameStage(person, quoted.id, { name: 'Secret-new-name' });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', quoted.id)
      .where('kind', '=', 'pipeline.stage_renamed')
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({ fields: ['name'], actor: { kind: 'user', id: person.profile.user.id } });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'pipeline.stage_renamed')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ stageId: quoted.id });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Secret-new-name');
  });

  it('answers 401 with nobody signed in, 403 to staff and without CSRF headers, and 400 for a bad body', async () => {
    const person = await createSignedInPerson(app, database);
    const quoted = (await readStages(person)).find((stage) => stage.name === 'Quoted')!;
    expect((await renameStage(null, quoted.id, { name: 'X' })).statusCode).toBe(401);
    expect((await renameStage(person, quoted.id, { name: 'X' }, false)).statusCode).toBe(403);
    for (const body of [{}, { name: '' }, { name: '  ' }, { name: 'x'.repeat(61) }, { name: 'X', kind: 'won' }]) {
      expect((await renameStage(person, quoted.id, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    await makeStaff(person);
    expect((await renameStage(person, quoted.id, { name: 'X' })).statusCode).toBe(403);
    expect(stageNames((await getPipeline(person)).json())).toContain('Quoted');
  });
});

describe('POST /api/v1/pipeline/stages/reorder', () => {
  it('puts the open stages in the new order and keeps Won and Lost last', async () => {
    const person = await createSignedInPerson(app, database);
    const [first, second, third] = (await readStages(person)).filter((stage) => stage.kind === 'open');
    const response = await reorderStages(person, { stageIds: [third!.id, first!.id, second!.id] });
    expect(response.statusCode, response.body).toBe(200);
    expect(stageNames(response.json())).toEqual(['Quoted', 'New', 'Contacted', 'Won', 'Lost']);
    expect(response.json().stages.map((stage: { sort: number }) => stage.sort)).toEqual([0, 1, 2, 3, 4]);
    expect(stageNames((await getPipeline(person)).json())).toEqual(['Quoted', 'New', 'Contacted', 'Won', 'Lost']);
  });

  it('works with stages the business added', async () => {
    const person = await createSignedInPerson(app, database);
    const added = (await addStage(person, { name: 'Site visit' })).json();
    const openIds = (await readStages(person)).filter((stage) => stage.kind === 'open').map((stage) => stage.id);
    const reversed = [...openIds].reverse();
    expect((await reorderStages(person, { stageIds: reversed })).statusCode).toBe(200);
    expect((await readStages(person))[0]!.id).toBe(added.id);
  });

  it('refuses a list that leaves out a stage, repeats one, or adds Won, Lost or a stranger', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const stages = await readStages(person);
    const openIds = stages.filter((stage) => stage.kind === 'open').map((stage) => stage.id);
    const wonId = stages.find((stage) => stage.kind === 'won')!.id;
    const strangersStageId = (await readStages(other))[0]!.id;
    const badLists = [
      openIds.slice(1),
      [...openIds, openIds[0]!],
      [openIds[0]!, openIds[0]!, openIds[1]!],
      [...openIds, wonId],
      [...openIds.slice(1), strangersStageId],
      [randomUUID()],
    ];
    for (const stageIds of badLists) {
      const response = await reorderStages(person, { stageIds });
      expect(response.statusCode, JSON.stringify(stageIds)).toBe(400);
      expect(response.json().error.code).toBe('STAGES_MISMATCH');
    }
    // Nothing changed, in either business
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
    expect((await readStages(other))[0]!.id).toBe(strangersStageId);
  });

  it('answers 400 for an empty list, ids that are not UUIDs, or an unknown field', async () => {
    const person = await createSignedInPerson(app, database);
    for (const body of [
      {},
      { stageIds: [] },
      { stageIds: ['x'] },
      { stageIds: 'x' },
      { stageIds: [randomUUID()], extra: 1 },
    ]) {
      expect((await reorderStages(person, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('records who did it in the activity log and the outbox', async () => {
    const person = await createSignedInPerson(app, database);
    const openIds = (await readStages(person)).filter((stage) => stage.kind === 'open').map((stage) => stage.id);
    await reorderStages(person, { stageIds: [...openIds].reverse() });
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'pipeline.stages_reordered')
      .executeTakeFirstOrThrow();
    expect(logLine).toMatchObject({
      record_type: 'pipeline',
      fields: ['sort'],
      actor: { kind: 'user', id: person.profile.user.id },
    });
    const event = await database.system
      .selectFrom('domain_events')
      .select('name')
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'pipeline.stages_reordered')
      .execute();
    expect(event).toHaveLength(1);
  });

  it('answers 401 with nobody signed in, 403 to staff and without CSRF headers', async () => {
    const person = await createSignedInPerson(app, database);
    const openIds = (await readStages(person)).filter((stage) => stage.kind === 'open').map((stage) => stage.id);
    const body = { stageIds: [...openIds].reverse() };
    expect((await reorderStages(null, body)).statusCode).toBe(401);
    expect((await reorderStages(person, body, false)).statusCode).toBe(403);
    await makeStaff(person);
    expect((await reorderStages(person, body)).statusCode).toBe(403);
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
  });
});

/** Removes a stage as the person. `query` is the part after the `?`. */
const removeStage = (person: SignedInPerson | null, stageId: string, query = '', withCsrfHeaders = true) =>
  app.inject({
    method: 'DELETE',
    url: `/api/v1/pipeline/stages/${stageId}${query ? `?${query}` : ''}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
  });

/** Puts a lead (and its contact) into a stage, straight into the database. Returns the lead's id. */
async function putLeadInStage(person: SignedInPerson, stageId: string, options: { deleted?: boolean } = {}) {
  const accountId = person.profile.business.id;
  const contactId = randomUUID();
  await database.system
    .insertInto('contacts')
    .values({
      id: contactId,
      account_id: accountId,
      name: null,
      phone: null,
      email: `${contactId}@example.com`,
      language: null,
    })
    .execute();
  const leadId = randomUUID();
  await database.system
    .insertInto('leads')
    .values({
      id: leadId,
      account_id: accountId,
      contact_id: contactId,
      stage_id: stageId,
      ...(options.deleted ? { deleted_at: new Date() } : {}),
    })
    .execute();
  return leadId;
}

/** The id of the stage with this name. */
async function stageIdNamed(person: SignedInPerson, name: string) {
  return (await readStages(person)).find((stage) => stage.name === name)!.id;
}

describe('DELETE /api/v1/pipeline/stages/{id}', () => {
  it('removes a stage with no leads, closes the gap, and keeps Won and Lost last', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await removeStage(person, await stageIdNamed(person, 'Contacted'));
    expect(response.statusCode, response.body).toBe(200);
    expect(stageNames(response.json())).toEqual(['New', 'Quoted', 'Won', 'Lost']);
    expect(response.json().stages.map((stage: { sort: number }) => stage.sort)).toEqual([0, 1, 2, 3]);
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Quoted', 'Won', 'Lost']);
  });

  it('moves the leads to the chosen stage and keeps their last-activity time', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    const quotedId = await stageIdNamed(person, 'Quoted');
    const leadId = await putLeadInStage(person, contactedId);
    const before = await database.system
      .selectFrom('leads')
      .select('last_activity_at')
      .where('id', '=', leadId)
      .executeTakeFirstOrThrow();

    const response = await removeStage(person, contactedId, `move_to=${quotedId}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().stages.find((stage: { id: string }) => stage.id === quotedId).leadCount).toBe(1);

    const after = await database.system
      .selectFrom('leads')
      .select(['stage_id', 'last_activity_at', 'updated_by'])
      .where('id', '=', leadId)
      .executeTakeFirstOrThrow();
    expect(after.stage_id).toBe(quotedId);
    expect(after.last_activity_at).toEqual(before.last_activity_at);
    expect(after.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('refuses a stage with leads when no move_to is given, naming how many, and removes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    await putLeadInStage(person, contactedId);
    await putLeadInStage(person, contactedId);
    const response = await removeStage(person, contactedId);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'STAGE_HAS_LEADS', details: { leadCount: 2 } });
    expect(stageNames((await getPipeline(person)).json())).toContain('Contacted');
  });

  it('removes a stage that holds only deleted leads, with no move_to, and the deleted leads follow along', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    const leadId = await putLeadInStage(person, contactedId, { deleted: true });
    expect((await removeStage(person, contactedId)).statusCode).toBe(200);
    const lead = await database.system
      .selectFrom('leads')
      .select('stage_id')
      .where('id', '=', leadId)
      .executeTakeFirstOrThrow();
    expect(lead.stage_id).toBe(await stageIdNamed(person, 'New'));
  });

  it('refuses a move_to that is the same stage, Won, or Lost (400 INVALID_MOVE_TO)', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    for (const targetId of [contactedId, await stageIdNamed(person, 'Won'), await stageIdNamed(person, 'Lost')]) {
      const response = await removeStage(person, contactedId, `move_to=${targetId}`);
      expect(response.statusCode, targetId).toBe(400);
      expect(response.json().error.code).toBe('INVALID_MOVE_TO');
    }
    expect(stageNames((await getPipeline(person)).json())).toContain('Contacted');
  });

  it('answers 404 for a move_to from another business or unknown, and 400 when it is not a UUID', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    const strangersStageId = await stageIdNamed(stranger, 'New');
    expect((await removeStage(person, contactedId, `move_to=${strangersStageId}`)).statusCode).toBe(404);
    expect((await removeStage(person, contactedId, `move_to=${randomUUID()}`)).statusCode).toBe(404);
    expect((await removeStage(person, contactedId, 'move_to=abc')).statusCode).toBe(400);
    expect(stageNames((await getPipeline(person)).json())).toContain('Contacted');
  });

  it('cannot remove Won or Lost', async () => {
    const person = await createSignedInPerson(app, database);
    for (const name of ['Won', 'Lost']) {
      const response = await removeStage(person, await stageIdNamed(person, name));
      expect(response.statusCode, name).toBe(409);
      expect(response.json().error.code).toBe('CLOSING_STAGE_CANNOT_BE_REMOVED');
    }
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Contacted', 'Quoted', 'Won', 'Lost']);
  });

  it('cannot remove the last open stage', async () => {
    const person = await createSignedInPerson(app, database);
    await removeStage(person, await stageIdNamed(person, 'Contacted'));
    await removeStage(person, await stageIdNamed(person, 'Quoted'));
    const response = await removeStage(person, await stageIdNamed(person, 'New'));
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('LAST_OPEN_STAGE');
    expect(stageNames((await getPipeline(person)).json())).toEqual(['New', 'Won', 'Lost']);
  });

  it("answers 404 for another business's stage and for an unknown id, and 400 for a bad id", async () => {
    const owner = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    const ownersStageId = await stageIdNamed(owner, 'Contacted');
    expect((await removeStage(stranger, ownersStageId)).statusCode).toBe(404);
    expect((await removeStage(stranger, randomUUID())).statusCode).toBe(404);
    expect((await removeStage(stranger, 'abc')).statusCode).toBe(400);
    expect(stageNames((await getPipeline(owner)).json())).toContain('Contacted');
  });

  it('records who did it, in the activity log and the outbox, with counts and ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    const quotedId = await stageIdNamed(person, 'Quoted');
    await putLeadInStage(person, contactedId);
    await removeStage(person, contactedId, `move_to=${quotedId}`);
    const logLine = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', contactedId)
      .where('kind', '=', 'pipeline.stage_removed')
      .executeTakeFirstOrThrow();
    expect(logLine.actor).toEqual({ kind: 'user', id: person.profile.user.id });
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'pipeline.stage_removed')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ stageId: contactedId, movedLeadCount: 1, movedToStageId: quotedId });
    expect(JSON.stringify(logLine) + JSON.stringify(event)).not.toContain('Contacted');
  });

  it('answers 401 with nobody signed in, 403 without CSRF headers and to staff, and removes nothing', async () => {
    const person = await createSignedInPerson(app, database);
    const contactedId = await stageIdNamed(person, 'Contacted');
    expect((await removeStage(null, contactedId)).statusCode).toBe(401);
    expect((await removeStage(person, contactedId, '', false)).statusCode).toBe(403);
    await makeStaff(person);
    expect((await removeStage(person, contactedId)).statusCode).toBe(403);
    expect(stageNames((await getPipeline(person)).json())).toContain('Contacted');
  });
});
