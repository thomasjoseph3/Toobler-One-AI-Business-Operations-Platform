import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import type { JobRun } from '../src/kernel/jobs/jobs';
import { createAiService } from '../src/modules/core/ai';
import aiModule from '../src/modules/core/ai/module';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig } from './support/app';
import { createSignedInPerson } from './support/auth';
import { findConsistencyProblems } from './support/consistency';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender } from './support/mail';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// One story for the whole of F37 (AI models and keys), told through the real routes, the real call service and the real nightly jobs,
// with a pretend AI company that does what each chapter needs. Cast: Anita (manager of Nair Stays), Ravi (her staff), Toby (the
// platform team), and Olive (the manager of another business who must see nothing of Nair Stays). After every chapter the consistency
// checker reads everything Nair Stays has in the database and lists any fact that does not add up. The AI company's models are shared
// by every test, so the chapters that change the platform's list put it back at the end.

let database: Database;
let app: FastifyInstance;
const mail = createRecordingMailSender();
/** What the pretend AI company does for the next call. Each chapter sets it. */
let script: LlmScript = () => ({ answer: 'OK', usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 60 } });
const pretendAiCompany = createScriptedLlmProvider((candidate, request) => script(candidate, request));
const platformGeminiKey = `journey-platform-gemini-${randomUUID()}`;
const platformOpenAiKey = `journey-platform-openai-${randomUUID()}`;

let anita: TeamMember;
let ravi: TeamMember;
let toby: TeamMember;
let olive: TeamMember;
let businessId: string;

/** What the platform's models looked like before the story, put back at the end. */
let originalTaskModels: Array<{ task: string; position: number; model_id: string }>;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], {
    config: {
      ...testConfig(),
      ai: { platformKeys: { gemini: [platformGeminiKey], openai: [platformOpenAiKey], anthropic: [] } },
    },
    llmProvider: pretendAiCompany,
    mailSender: mail,
  });
  anita = await signUpOwner(app, database);
  ravi = await addTeamMember(app, database, anita, { name: 'Ravi', role: 'staff' });
  toby = await signUpOwner(app, database);
  await database.system.updateTable('users').set({ is_platform_admin: true }).where('id', '=', toby.userId).execute();
  olive = await signUpOwner(app, database);
  businessId = anita.businessId;
  originalTaskModels = await database.system.selectFrom('ai_task_models').selectAll().execute();
});
afterAll(async () => {
  await database.system.deleteFrom('ai_task_models').execute();
  await database.system.insertInto('ai_task_models').values(originalTaskModels).execute();
  await database.system
    .updateTable('ai_models')
    .set({ status: 'active', retires_on: null })
    .where('model_name', 'in', ['gemini-3.5-flash-lite'])
    .execute();
  await database.system.deleteFrom('ai_notices_sent').execute();
  await app.close();
  await database.close();
});

/** The AI service the way another module would build it: from what the app offers. */
const aiService = () => createAiService({ database, config: app.kernel.config, llm: app.kernel.llm });

/** Asks the AI to do a job for Nair Stays. */
const ask = (task = 'chat_reply', agentId = 'webchat', channel = 'webchat') =>
  aiService().generateText({
    accountId: businessId,
    tag: { task, agentId, channel, promptVersion: 'journey-1' },
    prompt: { stableSystemText: 'STABLE-RULES', messages: [{ role: 'user', text: 'CUSTOMER-WORDS' }] },
  });

/** The consistency checker's findings for Nair Stays: an empty list means everything adds up. */
const problemsOfNairStays = () => findConsistencyProblems(database, businessId);

/** The platform's models by name. */
async function modelsByName() {
  const body = await anita.ok('GET', '/ai/models');
  return Object.fromEntries(
    (body.models as Array<{ id: string; modelName: string }>).map((model) => [model.modelName, model.id]),
  ) as Record<string, string>;
}

/** Runs one of the module's jobs the way the job runner would. */
async function runJob(jobName: string, accountId?: string) {
  const definition = aiModule.jobs?.find((job) => job.name === jobName);
  if (!definition) throw new Error(`no job ${jobName}`);
  const queued: Array<{ name: string; data: unknown }> = [];
  await definition.run({
    data: accountId ? { accountId } : {},
    accountContext: accountId ? app.kernel.contextFor(accountId, { kind: 'system', id: jobName }) : undefined,
    enqueueJob: async (name, data) => void queued.push({ name, data }),
    listAccountIds: async () => [businessId],
    logger: console as never,
    services: { config: app.kernel.config, database, mail, llm: app.kernel.llm },
  } satisfies JobRun);
  return queued;
}

const ownKeyTexts = {
  main: `AIzaSyJourneyMain${randomUUID().replace(/-/g, '')}`,
  backup: `AIzaSyJourneyBackup${randomUUID().replace(/-/g, '')}`,
};
let mainKeyId = '';
let backupKeyId = '';

describe('Chapter 1: Nair Stays has not set up any AI yet', () => {
  it('shows nothing available, asks fail clearly, and staff cannot see any of it', async () => {
    const models = await anita.ok('GET', '/ai/models');
    expect(models.models.every((model: { available: boolean }) => model.available === false)).toBe(true);
    expect(await anita.ok('GET', '/ai/settings')).toEqual({
      keyMode: 'own',
      taskModels: {},
      platformAccess: { enabled: false, monthlyCallCap: null, expiresAt: null },
    });
    await expect(ask()).rejects.toMatchObject({ status: 503, code: 'AI_NOT_AVAILABLE' });
    const status = await anita.ok('GET', '/ai/status');
    expect(status.tasks.every((task: { lastAnswer: unknown }) => task.lastAnswer === null)).toBe(true);
    for (const url of ['/ai/models', '/ai/settings', '/ai/keys', '/ai/usage', '/ai/status', '/ai/calls']) {
      await ravi.refused('GET', url, undefined, 403);
    }
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 2: the platform lends its keys for a trial, with a cap', () => {
  it('Toby switches the platform keys on for 3 calls; Anita chooses them; the fourth call is refused; a higher cap brings it back', async () => {
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await toby.ok('PUT', `/platform/businesses/${businessId}/ai-access`, {
      enabled: true,
      monthlyCallCap: 3,
      expiresAt: endsAt,
    });
    await anita.ok('PUT', '/ai/settings', { keyMode: 'platform' });
    expect((await anita.ok('GET', '/ai/settings')).platformAccess).toEqual({
      enabled: true,
      monthlyCallCap: 3,
      expiresAt: endsAt,
    });
    const models = await anita.ok('GET', '/ai/models');
    expect(models.models.filter((model: { available: boolean }) => model.available).length).toBeGreaterThan(0);

    for (let call = 1; call <= 3; call += 1) {
      const answer = await ask();
      expect(answer.details.servedBy).toMatchObject({
        keySource: 'platform',
        provider: 'gemini',
        modelName: 'gemini-flash-lite-latest',
      });
    }
    const usage = await anita.ok('GET', '/ai/usage');
    expect(usage.totals.calls).toBe(3);
    expect(usage.platform).toMatchObject({ enabled: true, monthlyCallCap: 3, usedThisMonth: 3, remainingThisMonth: 0 });
    await expect(ask()).rejects.toMatchObject({ status: 402, code: 'AI_CAP_REACHED' });

    await toby.ok('PUT', `/platform/businesses/${businessId}/ai-access`, { monthlyCallCap: 10 });
    expect((await ask()).text).toBe('OK');
    expect((await anita.ok('GET', '/ai/usage')).platform).toMatchObject({ usedThisMonth: 4, remainingThisMonth: 6 });
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 3: Anita adds her own keys and tests them', () => {
  it('saves a main and a backup key, sees only previews, tests both, and moves to “own first, then platform”', async () => {
    const main = await anita.ok('POST', '/ai/keys', { provider: 'gemini', label: 'Main', key: ownKeyTexts.main }, 201);
    const backup = await anita.ok(
      'POST',
      '/ai/keys',
      { provider: 'gemini', label: 'Backup', key: ownKeyTexts.backup },
      201,
    );
    mainKeyId = main.id;
    backupKeyId = backup.id;
    expect(main.keyPreview).toBe(`••••${ownKeyTexts.main.slice(-4)}`);
    const listed = await anita.send('GET', '/ai/keys');
    expect(listed.body).not.toContain(ownKeyTexts.main);
    expect(listed.body).not.toContain(ownKeyTexts.backup);

    script = () => ({ answer: 'OK' });
    for (const keyId of [mainKeyId, backupKeyId]) {
      const test = await anita.ok('POST', `/ai/keys/${keyId}/test`);
      expect(test).toMatchObject({ outcome: 'works', key: { status: 'working' } });
    }
    await anita.ok('PUT', '/ai/settings', { keyMode: 'own_then_platform' });
    script = () => ({ answer: 'OK', usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 60 } });
    const answer = await ask();
    expect(answer.details.servedBy).toMatchObject({ keySource: 'own', keyPosition: 1 });
    // her own keys cost the platform nothing: the platform count has not moved
    expect((await anita.ok('GET', '/ai/usage')).platform.usedThisMonth).toBe(4);
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 4: a busy day, the main key hits its limit', () => {
  it('falls to the backup key, shows the main key resting, and the log, the totals and the status all say so', async () => {
    script = (candidate) => {
      if (candidate.apiKey === ownKeyTexts.main) throw new Error('429 quota exceeded');
      return { answer: 'OK', usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 60 } };
    };
    // The keys take turns, so the main key is tried first on one of two calls; that call falls back to the backup key
    const answers = [await ask('chat_reply', 'whatsapp', 'whatsapp'), await ask('chat_reply', 'whatsapp', 'whatsapp')];
    const fellBack = answers.filter((answer) => answer.details.fallbackUsed);
    expect(fellBack).toHaveLength(1);
    expect(fellBack[0]?.details).toMatchObject({
      fallbackReason: 'rate_limited',
      servedBy: { keySource: 'own', keyPosition: 2 },
    });
    expect(answers.every((answer) => answer.details.servedBy.keyPosition === 2)).toBe(true);

    const status = await anita.ok('GET', '/ai/status');
    const chat = status.tasks.find((task: { taskId: string }) => task.taskId === 'chat_reply');
    expect(chat.lastAnswer).toMatchObject({ keySource: 'own' });
    expect(status.restingKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ keySource: 'own', keyLabel: 'Main', keyPosition: 1 })]),
    );

    const log = await anita.ok('GET', '/ai/calls?agent=whatsapp');
    expect(log.items).toHaveLength(2);
    const fallbackCall = log.items.find((item: { fallbackUsed: boolean }) => item.fallbackUsed);
    expect(fallbackCall).toMatchObject({ agentId: 'whatsapp', channel: 'whatsapp', attemptCount: 2, cachedTokens: 60 });
    expect(fallbackCall.attempts.map((attempt: { outcome: string }) => attempt.outcome)).toEqual([
      'rate_limited',
      'ok',
    ]);
    const byAgent = await anita.ok('GET', '/ai/usage?groupBy=agent');
    expect(byAgent.groups.find((group: { key: string }) => group.key === 'whatsapp')).toMatchObject({
      calls: 2,
      fallbacks: 1,
      cacheHitRate: 0.6,
    });
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 5: the main key is rejected, the nightly check warns Anita once, and she removes it', () => {
  it('the nightly check finds the rejection and emails her one time; removing the key wipes the secret and frees the place', async () => {
    script = (candidate) => {
      if (candidate.apiKey === ownKeyTexts.main) throw new Error('API key not valid');
      return { answer: 'OK' };
    };
    // Ordinary calls leave the resting main key alone (the backup answers), so it still shows "limited" from the busy day
    await ask();
    const afterUse = (await anita.ok('GET', '/ai/keys')).items as Array<{ id: string; label: string; status: string }>;
    expect(afterUse.find((key) => key.label === 'Main')?.status).toBe('limited');
    expect(afterUse.find((key) => key.label === 'Backup')?.status).toBe('working');

    // The nightly check tests every key for real, and finds the main key is now rejected
    mail.sent.length = 0;
    await runJob('ai.check_business_keys', businessId);
    await runJob('ai.check_business_keys', businessId); // the same day: no second email
    const afterCheck = (await anita.ok('GET', '/ai/keys')).items as Array<{
      label: string;
      status: string;
      statusNote: string;
    }>;
    expect(afterCheck.find((key) => key.label === 'Main')).toMatchObject({ status: 'failed' });
    expect(afterCheck.find((key) => key.label === 'Main')?.statusNote).toContain('rejected');
    const toAnita = mail.sent.filter((message) => message.to === anita.email);
    expect(toAnita).toHaveLength(1);
    expect(toAnita[0]?.subject).toBe('Your Google Gemini key "Main" needs attention');
    expect(JSON.stringify(mail.sent)).not.toContain(ownKeyTexts.main);
    expect(mail.sent.filter((message) => message.to === ravi.email)).toHaveLength(0); // staff are not told

    await anita.ok('DELETE', `/ai/keys/${mainKeyId}`, undefined, 204);
    const remaining = (await anita.ok('GET', '/ai/keys')).items;
    expect(remaining.map((key: { label: string }) => key.label)).toEqual(['Backup']);
    const row = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('id', '=', mainKeyId)
      .executeTakeFirstOrThrow();
    expect(row.encrypted_key).toBe('v1.removed.removed.removed');
    await anita.refused('POST', `/ai/keys/${mainKeyId}/test`, undefined, 404);
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 6: Anita chooses her own models for replies; the platform changes its default', () => {
  it('her order wins for chat replies only, and the platform’s change reaches every business that has not chosen its own', async () => {
    const ids = await modelsByName();
    script = () => ({ answer: 'OK' });
    await anita.ok(
      'POST',
      '/ai/keys',
      { provider: 'openai', label: 'OpenAI', key: `sk-journey-${randomUUID().replace(/-/g, '')}` },
      201,
    );
    const saved = await anita.ok('PUT', '/ai/settings', {
      taskModels: { chat_reply: [ids['gpt-4o-mini'], ids['gemini-3.5-flash']] },
    });
    expect(saved.taskModels.chat_reply).toEqual([ids['gpt-4o-mini'], ids['gemini-3.5-flash']]);

    expect((await ask('chat_reply')).details.servedBy).toMatchObject({
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      keySource: 'own',
    });
    expect((await ask('summarise')).details.servedBy).toMatchObject({
      provider: 'gemini',
      modelName: 'gemini-flash-lite-latest',
    });

    await toby.ok('PUT', '/platform/ai/tasks/chat_reply/models', { modelIds: [ids['gemini-3.5-flash']] });
    const afterChange = await anita.ok('GET', '/ai/models');
    expect(afterChange.configuredOrder.chat_reply).toEqual([ids['gpt-4o-mini'], ids['gemini-3.5-flash']]); // hers
    // another business that never chose follows the platform
    await olive.ok('PUT', '/ai/settings', { keyMode: 'platform' });
    expect((await olive.ok('GET', '/ai/models')).configuredOrder.chat_reply).toEqual([ids['gemini-3.5-flash']]);
    // clearing her choice puts her back on the platform's order
    await anita.ok('PUT', '/ai/settings', { taskModels: {} });
    expect((await anita.ok('GET', '/ai/models')).configuredOrder.chat_reply).toEqual([ids['gemini-3.5-flash']]);
    expect(await problemsOfNairStays()).toEqual([]);
  });
});

describe('Chapter 7: a model is about to retire', () => {
  it('Toby sets the date, the nightly check warns him once, and retiring the model takes it out of Anita’s answers', async () => {
    const ids = await modelsByName();
    const retiresOn = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await toby.ok('PATCH', `/platform/ai/models/${ids['gemini-3.5-flash-lite']}`, { retiresOn });
    mail.sent.length = 0;
    script = () => ({ answer: 'OK' });
    await runJob('ai.check_health');
    await runJob('ai.check_health');
    const toToby = mail.sent.filter(
      (message) => message.to === toby.email && message.subject.includes('Gemini 3.5 Flash-Lite'),
    );
    expect(toToby).toHaveLength(1);
    expect(toToby[0]?.text).toContain(retiresOn);

    await toby.ok('PATCH', `/platform/ai/models/${ids['gemini-3.5-flash-lite']}`, { status: 'retired' });
    const models = await anita.ok('GET', '/ai/models');
    for (const task of models.tasks) expect(models.order[task.id]).not.toContain(ids['gemini-3.5-flash-lite']);
    // the platform's own keys were tested by the same nightly check
    const platformKeys = await toby.ok('GET', '/platform/ai/keys');
    expect(platformKeys.items.every((key: { status: string }) => key.status === 'working')).toBe(true);
  });
});

describe('Chapter 8: the numbers agree everywhere', () => {
  it('the totals, the groups and the call log tell the same story, with no words and no keys in any of them', async () => {
    const usage = await anita.ok('GET', '/ai/usage?groupBy=task');
    const log = await anita.ok('GET', '/ai/calls?limit=200');
    const answered = log.items.filter((item: { success: boolean }) => item.success);
    expect(usage.totals.calls).toBe(answered.length);
    expect(usage.groups.reduce((sum: number, group: { calls: number }) => sum + group.calls, 0)).toBe(
      usage.totals.calls,
    );
    const tokensInLog = log.items.reduce((sum: number, item: { inputTokens: number }) => sum + item.inputTokens, 0);
    expect(usage.totals.inputTokens).toBe(tokensInLog);
    expect(usage.totals.fallbacks).toBe(
      log.items.filter((item: { fallbackUsed: boolean }) => item.fallbackUsed).length,
    );

    const everythingShown = JSON.stringify([
      usage,
      log,
      await anita.ok('GET', '/ai/status'),
      await anita.ok('GET', '/ai/keys'),
    ]);
    for (const secret of [
      'STABLE-RULES',
      'CUSTOMER-WORDS',
      ownKeyTexts.main,
      ownKeyTexts.backup,
      platformGeminiKey,
      platformOpenAiKey,
      'encrypted',
    ]) {
      expect(everythingShown).not.toContain(secret);
    }
    // nothing the business typed ever appears in the log or the events
    const written = JSON.stringify([
      await database.system.selectFrom('activity_log').selectAll().where('account_id', '=', businessId).execute(),
      await database.system.selectFrom('domain_events').selectAll().where('account_id', '=', businessId).execute(),
    ]);
    for (const secret of [ownKeyTexts.main, ownKeyTexts.backup, 'STABLE-RULES', 'CUSTOMER-WORDS'])
      expect(written).not.toContain(secret);
    expect(await problemsOfNairStays()).toEqual([]);
  });

  it('the nightly clean-up deletes call records older than 90 days and keeps every daily total', async () => {
    const before = await database.system
      .selectFrom('ai_calls')
      .select('id')
      .where('account_id', '=', businessId)
      .orderBy('created_at')
      .execute();
    const oldest = before[0]?.id as string;
    await database.system
      .updateTable('ai_calls')
      .set({ created_at: new Date(Date.now() - 100 * 86_400_000) })
      .where('id', '=', oldest)
      .execute();
    const totalsBefore = (await anita.ok('GET', '/ai/usage')).totals.calls;
    await runJob('ai.clean_old_calls');
    const after = await database.system
      .selectFrom('ai_calls')
      .select('id')
      .where('account_id', '=', businessId)
      .execute();
    expect(after).toHaveLength(before.length - 1);
    expect(after.map((row) => row.id)).not.toContain(oldest);
    expect((await anita.ok('GET', '/ai/usage')).totals.calls).toBe(totalsBefore); // the daily totals are untouched
  });
});

describe('Chapter 9: Olive sees nothing of Nair Stays', () => {
  it('has no keys, no calls and no usage of its own to confuse with Nair Stays’; cannot touch Anita’s key; cannot reach the platform’s controls', async () => {
    expect((await olive.ok('GET', '/ai/keys')).items).toEqual([]);
    expect((await olive.ok('GET', '/ai/calls')).items).toEqual([]);
    expect((await olive.ok('GET', '/ai/usage')).totals.calls).toBe(0);
    await toby.ok('PUT', `/platform/businesses/${olive.businessId}/ai-access`, { enabled: true }); // Olive is on a trial of her own
    await olive.refused('DELETE', `/ai/keys/${backupKeyId}`, undefined, 404);
    await olive.refused('POST', `/ai/keys/${backupKeyId}/test`, undefined, 404);
    await olive.refused('GET', `/platform/businesses/${businessId}/ai-access`, undefined, 403);
    await olive.refused(
      'PUT',
      `/platform/businesses/${businessId}/ai-access`,
      { enabled: true, monthlyCallCap: 99999 },
      403,
    );
    await olive.refused('PATCH', '/platform/ai/models/' + randomUUID(), { status: 'retired' }, 403);
    await olive.refused('GET', '/platform/ai/keys', undefined, 403);
    // asking the AI for Olive never uses Nair Stays' keys
    script = (candidate) => {
      expect([ownKeyTexts.main, ownKeyTexts.backup]).not.toContain(candidate.apiKey);
      return { answer: 'OK' };
    };
    const oliveAnswer = await aiService().generateText({
      accountId: olive.businessId,
      tag: { task: 'chat_reply', agentId: 'webchat', channel: 'webchat', promptVersion: 'journey-1' },
      prompt: { stableSystemText: 'rules', messages: [{ role: 'user', text: 'hi' }] },
    });
    expect(oliveAnswer.details.servedBy.keySource).toBe('platform');
    // Nair Stays' backup key is still there and still hers
    expect((await anita.ok('GET', '/ai/keys')).items.map((key: { id: string }) => key.id)).toContain(backupKeyId);
    expect(await findConsistencyProblems(database, olive.businessId)).toEqual([]);
  });
});

describe('the consistency checker catches AI damage', () => {
  it('names a removed key that still holds its secret, a live key holding the placeholder, a key set too high, a model order naming a model that does not exist, and totals that do not match the calls', async () => {
    const person = await createSignedInPerson(app, database);
    const damagedBusinessId = person.profile.business.id;
    const keyRow = (overrides: Record<string, unknown>) => ({
      id: randomUUID(),
      account_id: damagedBusinessId,
      provider: 'gemini' as const,
      label: 'Damaged',
      encrypted_key: 'v1.a.b.c',
      key_last_four: 'abcd',
      key_fingerprint: randomUUID().replace(/-/g, '').padEnd(64, 'a'),
      ...overrides,
    });
    await database.system
      .insertInto('ai_keys')
      .values(keyRow({ deleted_at: new Date() }))
      .execute(); // removed but not wiped
    await database.system
      .insertInto('ai_keys')
      .values(keyRow({ encrypted_key: 'v1.removed.removed.removed' }))
      .execute(); // live but wiped
    await database.system
      .insertInto('ai_keys')
      .values(keyRow({ status: 'failed' }))
      .execute(); // a status with no time it was checked
    await database.system
      .insertInto('ai_settings')
      .values({ account_id: damagedBusinessId, task_models: { chat_reply: [randomUUID()] } })
      .execute();
    await database.system
      .insertInto('ai_usage')
      .values({
        account_id: damagedBusinessId,
        day: new Date().toISOString().slice(0, 10),
        provider: 'gemini',
        model_name: 'm',
        task: 'chat_reply',
        agent_id: 'a',
        channel: 'c',
        key_source: 'own',
        calls: 7,
      })
      .execute();
    const problems = await findConsistencyProblems(database, damagedBusinessId);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/removed AI key .* still holds its secret/),
        expect.stringMatching(/live AI key .* holds the wiped placeholder/),
        expect.stringMatching(/AI key .* has a status but no time it was checked/),
        expect.stringMatching(/the model order for chat_reply names a model that does not exist/),
        expect.stringMatching(/the AI usage totals do not match the call records/),
      ]),
    );
    // 11 keys of one company are over the limit (inserted straight into the table, past the route's check)
    for (let count = 0; count < 10; count += 1)
      await database.system
        .insertInto('ai_keys')
        .values(keyRow({ label: `Extra ${count}` }))
        .execute();
    expect(await findConsistencyProblems(database, damagedBusinessId)).toEqual(
      expect.arrayContaining([expect.stringMatching(/live gemini keys \(the limit is 10\)/)]),
    );
  });
});
