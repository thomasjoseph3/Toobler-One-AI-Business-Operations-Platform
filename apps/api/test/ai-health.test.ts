import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import type { JobRun } from '../src/kernel/jobs/jobs';
import aiModule from '../src/modules/core/ai/module';
import { createAiHealthService } from '../src/modules/core/ai/services/ai-health.service';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import type { MailMessage } from '../src/providers/mail';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender } from './support/mail';

let database: Database;
let app: FastifyInstance;
let platformAdmin: SignedInPerson;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  platformAdmin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
});
afterEach(async () => {
  await database.system.deleteFrom('ai_platform_key_checks').execute();
  await database.system.deleteFrom('ai_notices_sent').execute();
  await database.system
    .updateTable('ai_models')
    .set({ retires_on: null })
    .where('retires_on', 'is not', null)
    .execute();
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** The health service on the test database, with a pretend AI company and a mail sender that keeps what it is given. */
function healthWith(options: {
  platformKeys?: { gemini?: string[]; openai?: string[] };
  script?: LlmScript;
  listModels?: (provider: string, apiKey: string) => string[] | Promise<string[]>;
  now?: Date;
}) {
  const mail = createRecordingMailSender();
  const llm = createScriptedLlmProvider(options.script ?? (() => ({ answer: 'OK' })), options.listModels as never);
  const config = {
    ...testConfig(),
    ai: {
      platformKeys: {
        gemini: options.platformKeys?.gemini ?? [],
        openai: options.platformKeys?.openai ?? [],
        anthropic: [],
      },
    },
  };
  let clock = options.now ?? new Date();
  const problems: string[] = [];
  const health = createAiHealthService({
    services: { config, database, mail, llm },
    now: () => clock,
    reportProblem: (what) => void problems.push(what),
  });
  return { health, mail, problems, setClock: (moment: Date) => (clock = moment) };
}

async function newBusiness(settings: { noticesEnabled?: boolean } = {}) {
  const manager = await createSignedInPerson(app, database);
  if (settings.noticesEnabled !== undefined) {
    await database.system
      .insertInto('ai_settings')
      .values({ account_id: manager.profile.business.id, notices_enabled: settings.noticesEnabled })
      .execute();
  }
  return { manager, accountId: manager.profile.business.id };
}

async function saveOwnKey(manager: SignedInPerson, label: string, provider: 'gemini' | 'openai' = 'gemini') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ai/keys',
    headers: { ...unsafeRequestHeaders, cookie: manager.cookieHeader },
    payload: { provider, label, key: `AIzaSyHealth${randomUUID().replace(/-/g, '')}` },
  });
  return response.json().id as string;
}

const emailsTo = (mail: { sent: MailMessage[] }, person: SignedInPerson) =>
  mail.sent.filter((message) => message.to === person.email);

describe('checking the platform’s own keys', () => {
  it('tests every key, saves what it found by position, and sends no email when all work', async () => {
    const { health, mail } = healthWith({
      platformKeys: { gemini: [`h-${randomUUID()}`, `h-${randomUUID()}`], openai: [`h-${randomUUID()}`] },
    });
    expect(await health.checkPlatformKeys()).toEqual({ tested: 3, problems: 0 });
    const checks = await database.system
      .selectFrom('ai_platform_key_checks')
      .selectAll()
      .orderBy('provider')
      .orderBy('key_position')
      .execute();
    expect(checks.map((check) => `${check.provider}#${check.key_position}:${check.status}`)).toEqual([
      'gemini#1:working',
      'gemini#2:working',
      'openai#1:working',
    ]);
    expect(checks[0]?.status_note).toContain('Answered using');
    expect(mail.sent).toHaveLength(0);
  });

  it('warns the platform team about a rejected key, naming its place and never the key, and again no sooner than a day later', async () => {
    const badKey = `h-bad-${randomUUID()}`;
    const { health, mail, setClock } = healthWith({
      platformKeys: { gemini: [`h-ok-${randomUUID()}`, badKey] },
      script: (candidate) => {
        if (candidate.apiKey === badKey) throw new Error(`API key not valid ${badKey}`);
        return { answer: 'OK' };
      },
      now: new Date('2026-11-13T02:15:00Z'),
    });
    const result = await health.checkPlatformKeys();
    expect(result).toEqual({ tested: 2, problems: 1 });
    const check = await database.system
      .selectFrom('ai_platform_key_checks')
      .selectAll()
      .where('key_position', '=', 2)
      .executeTakeFirstOrThrow();
    expect(check.status).toBe('failed');
    const toAdmin = emailsTo(mail, platformAdmin);
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0]?.subject).toBe('Platform Google Gemini key 2 needs attention');
    expect(JSON.stringify(mail.sent)).not.toContain(badKey);
    // the next check an hour later: still failing, but no second email yet
    setClock(new Date('2026-11-13T03:15:00Z'));
    await health.checkPlatformKeys();
    expect(emailsTo(mail, platformAdmin)).toHaveLength(1);
    // a day later: one reminder
    setClock(new Date('2026-11-14T02:16:00Z'));
    await health.checkPlatformKeys();
    expect(emailsTo(mail, platformAdmin)).toHaveLength(2);
  });

  it('records a used-up quota as limited, and a key it could not reach as unchanged', async () => {
    const limitedKey = `h-limited-${randomUUID()}`;
    const flakyKey = `h-flaky-${randomUUID()}`;
    const { health } = healthWith({
      platformKeys: { gemini: [limitedKey, flakyKey] },
      script: (candidate) => {
        if (candidate.apiKey === limitedKey) throw new Error('429 quota exceeded');
        throw new Error('socket hang up');
      },
    });
    await database.system
      .insertInto('ai_platform_key_checks')
      .values({ provider: 'gemini', key_position: 2, status: 'working', status_note: 'earlier' })
      .execute();
    await health.checkPlatformKeys();
    const checks = await database.system
      .selectFrom('ai_platform_key_checks')
      .selectAll()
      .orderBy('key_position')
      .execute();
    expect(checks.map((check) => `${check.key_position}:${check.status}`)).toEqual(['1:limited', '2:working']);
    expect(checks[1]?.status_note).toBe('earlier');
  });

  it('does nothing and sends nothing when the server has no platform keys', async () => {
    const { health, mail } = healthWith({});
    expect(await health.checkPlatformKeys()).toEqual({ tested: 0, problems: 0 });
    expect(mail.sent).toHaveLength(0);
  });
});

describe('watching the models', () => {
  it('warns about models we list that the company no longer shows, and says nothing when they are all there', async () => {
    const all = (
      await database.system.selectFrom('ai_models').select('model_name').where('provider', '=', 'gemini').execute()
    ).map((row) => row.model_name);
    const quiet = healthWith({ platformKeys: { gemini: ['m-1'] }, listModels: () => all });
    expect(await quiet.health.checkModels()).toEqual({ missing: 0, suggested: 0 });
    expect(quiet.mail.sent).toHaveLength(0);
    const loud = healthWith({
      platformKeys: { gemini: ['m-2'] },
      listModels: () => all.filter((name) => name !== 'gemini-3.1-flash-lite'),
    });
    expect((await loud.health.checkModels()).missing).toBe(1);
    const email = emailsTo(loud.mail, platformAdmin)[0];
    expect(email?.subject).toBe('Google Gemini no longer lists 1 of our models');
    expect(email?.text).toContain('gemini-3.1-flash-lite');
  });

  it('suggests new models once, and not again for the same set', async () => {
    const all = (
      await database.system.selectFrom('ai_models').select('model_name').where('provider', '=', 'gemini').execute()
    ).map((row) => row.model_name);
    const { health, mail, setClock } = healthWith({
      platformKeys: { gemini: ['m-3'] },
      listModels: () => [...all, 'gemini-9.9-flash', 'gemini-9.9-flash-lite'],
    });
    expect((await health.checkModels()).suggested).toBe(2);
    expect(emailsTo(mail, platformAdmin)[0]?.subject).toBe('Google Gemini offers 2 new models');
    setClock(new Date(Date.now() + 5 * 86_400_000));
    await health.checkModels();
    expect(emailsTo(mail, platformAdmin)).toHaveLength(1);
  });

  it('tries the next platform key when one cannot list, and skips a company whose keys all fail, reporting it', async () => {
    const all = (
      await database.system.selectFrom('ai_models').select('model_name').where('provider', '=', 'gemini').execute()
    ).map((row) => row.model_name);
    const { health, problems } = healthWith({
      platformKeys: { gemini: ['m-bad', 'm-good'], openai: ['m-openai'] },
      listModels: (provider, apiKey) => {
        if (apiKey === 'm-bad' || provider === 'openai')
          throw new Error('The AI company answered 401 to the list of models');
        return all;
      },
    });
    expect(await health.checkModels()).toEqual({ missing: 0, suggested: 0 });
    expect(problems).toEqual([
      'Could not list the gemini models with one platform key',
      'Could not list the openai models with one platform key',
    ]);
  });

  it('warns 30 days, 7 days and at the retirement date, each once, and never for a retired model or one far away', async () => {
    const now = new Date('2026-11-13T02:15:00Z');
    const set = (name: string, retiresOn: string | null, status = 'active') =>
      database.system
        .updateTable('ai_models')
        .set({ retires_on: retiresOn, status: status as never })
        .where('model_name', '=', name)
        .execute();
    await set('gemini-3.5-flash-lite', '2026-12-10');
    await set('gemini-3.1-flash-lite', '2026-11-18');
    await set('gpt-4o-mini', '2027-06-01');
    await set('claude-haiku-5-5', '2026-11-01', 'retired');
    try {
      const { health, mail, setClock } = healthWith({ now });
      expect((await health.checkRetirements()).warned).toBe(2);
      const subjects = emailsTo(mail, platformAdmin)
        .map((message) => message.subject)
        .sort();
      expect(subjects).toEqual(['Gemini 3.1 Flash-Lite is retiring soon', 'Gemini 3.5 Flash-Lite is retiring soon']);
      // the same day again, and the next day: nothing new for the same warning
      await health.checkRetirements();
      setClock(new Date('2026-11-14T02:15:00Z'));
      await health.checkRetirements();
      expect(emailsTo(mail, platformAdmin)).toHaveLength(2);
      // when the date comes, one more
      setClock(new Date('2026-11-18T02:15:00Z'));
      await health.checkRetirements();
      const passed = emailsTo(mail, platformAdmin).filter((message) =>
        message.subject.includes('has reached its retirement date'),
      );
      expect(passed).toHaveLength(1);
    } finally {
      await database.system
        .updateTable('ai_models')
        .set({ status: 'active' })
        .where('model_name', '=', 'claude-haiku-5-5')
        .execute();
    }
  });
});

describe('checking a business’s own keys', () => {
  it('tests each key, saves what it found, and tells the managers about a key that fails, naming it by its label', async () => {
    const { manager, accountId } = await newBusiness();
    const goodKeyId = await saveOwnKey(manager, 'Good one');
    const badKeyId = await saveOwnKey(manager, 'Bad <b>one</b>');
    const badKeyText = new Map<string, string>();
    const { health, mail } = healthWith({
      script: (candidate) => {
        badKeyText.set(candidate.apiKey, candidate.apiKey);
        const stored = [...badKeyText.keys()];
        // the second key saved is the one that fails
        if (candidate.apiKey !== stored[0] && stored.length > 1) throw new Error('API key not valid');
        return { answer: 'OK' };
      },
    });
    // test the keys in saved order: the first answers, the second is rejected
    const result = await health.checkBusinessKeys(accountId);
    expect(result).toEqual({ tested: 2, problems: 1 });
    const keys = await database.system
      .selectFrom('ai_keys')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('created_at')
      .execute();
    expect(keys.map((key) => [key.id, key.status])).toEqual([
      [goodKeyId, 'working'],
      [badKeyId, 'failed'],
    ]);
    expect(keys[1]?.status_checked_at).not.toBeNull();
    expect(keys[1]?.last_notice_at).not.toBeNull();
    const toManager = emailsTo(mail, manager);
    expect(toManager).toHaveLength(1);
    expect(toManager[0]?.subject).toBe('Your Google Gemini key "Bad <b>one</b>" needs attention');
    expect(toManager[0]?.html).not.toContain('<b>one</b>');
    expect(JSON.stringify(mail.sent)).not.toContain('AIzaSyHealth'); // no key text in any email
  });

  it('writes one log line when a key’s status changes, and none when it stays the same', async () => {
    const { manager, accountId } = await newBusiness();
    await saveOwnKey(manager, 'Only');
    const { health } = healthWith({ script: () => ({ answer: 'OK' }) });
    await health.checkBusinessKeys(accountId);
    await health.checkBusinessKeys(accountId);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('kind', '=', 'ai.key_status_changed')
      .execute();
    expect(lines).toHaveLength(1); // unchecked -> working, once
    expect(lines[0]?.actor).toEqual({ kind: 'system', id: 'ai.check_business_keys' });
  });

  it('sends one warning a day for a key that stays bad, and none at all when the business switched warnings off', async () => {
    const { manager, accountId } = await newBusiness();
    await saveOwnKey(manager, 'Stays bad');
    const { health, mail, setClock } = healthWith({
      script: () => {
        throw new Error('API key not valid');
      },
      now: new Date('2026-11-13T02:15:00Z'),
    });
    await health.checkBusinessKeys(accountId);
    await health.checkBusinessKeys(accountId);
    expect(emailsTo(mail, manager)).toHaveLength(1);
    setClock(new Date('2026-11-14T02:16:00Z'));
    await health.checkBusinessKeys(accountId);
    expect(emailsTo(mail, manager)).toHaveLength(2);

    const silent = await newBusiness({ noticesEnabled: false });
    await saveOwnKey(silent.manager, 'Silent');
    await health.checkBusinessKeys(silent.accountId);
    expect(emailsTo(mail, silent.manager)).toHaveLength(0);
    // the key is still marked failed, so the manager sees it in the list
    const row = await database.system
      .selectFrom('ai_keys')
      .select('status')
      .where('account_id', '=', silent.accountId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
  });

  it('does not touch another business’s keys', async () => {
    const first = await newBusiness();
    const second = await newBusiness();
    await saveOwnKey(first.manager, 'First');
    const secondKeyId = await saveOwnKey(second.manager, 'Second');
    const { health } = healthWith({ script: () => ({ answer: 'OK' }) });
    await health.checkBusinessKeys(first.accountId);
    const untouched = await database.system
      .selectFrom('ai_keys')
      .select('status')
      .where('id', '=', secondKeyId)
      .executeTakeFirstOrThrow();
    expect(untouched.status).toBe('unchecked');
  });

  it('counts a key that cannot be unscrambled as failed, reports it, and carries on', async () => {
    const { manager, accountId } = await newBusiness();
    // A stored key that cannot be read (written straight into the table: the database refuses any later change to a stored key)
    const keyId = randomUUID();
    await database.system
      .insertInto('ai_keys')
      .values({
        id: keyId,
        account_id: accountId,
        provider: 'gemini',
        label: 'Damaged',
        encrypted_key: 'v1.garbage.garbage.garbage',
        key_last_four: 'abcd',
        key_fingerprint: 'f'.repeat(64),
      })
      .execute();
    const { health, problems, mail } = healthWith({ script: () => ({ answer: 'OK' }) });
    expect(await health.checkBusinessKeys(accountId)).toEqual({ tested: 1, problems: 1 });
    expect(problems).toEqual(['Could not read a saved AI key']);
    expect(
      (await database.system.selectFrom('ai_keys').select('status').where('id', '=', keyId).executeTakeFirstOrThrow())
        .status,
    ).toBe('failed');
    expect(emailsTo(mail, manager)).toHaveLength(1);
  });

  it('does nothing when the business has no keys or the server has no secret', async () => {
    const { accountId } = await newBusiness();
    const { health } = healthWith({});
    expect(await health.checkBusinessKeys(accountId)).toEqual({ tested: 0, problems: 0 });
    const noSecret = createAiHealthService({
      services: {
        config: { ...testConfig(), secrets: { encryptionKey: null } },
        database,
        mail: createRecordingMailSender(),
        llm: createScriptedLlmProvider(() => ({ answer: 'OK' })),
      },
    });
    expect(await noSecret.checkBusinessKeys(accountId)).toEqual({ tested: 0, problems: 0 });
  });
});

describe('watching for jobs that keep falling back', () => {
  /** Writes `count` answered calls that needed a fallback. */
  async function writeFallbackCalls(
    accountId: string,
    count: number,
    keySource: 'own' | 'platform',
    task = 'chat_reply',
  ) {
    for (let index = 0; index < count; index += 1) {
      await database.system
        .insertInto('ai_calls')
        .values({
          id: randomUUID(),
          account_id: accountId,
          task,
          agent_id: 'webchat',
          channel: 'webchat',
          prompt_version: 'p-1',
          provider: 'gemini',
          model_name: 'gemini-3.5-flash-lite',
          key_source: keySource,
          key_position: 1,
          success: true,
          attempt_count: 2,
          fallback_used: true,
          fallback_reason: 'rate_limited',
        })
        .execute();
    }
  }

  it('warns a business’s managers when its own keys fell back five times in the hour, and not for four', async () => {
    const { manager, accountId } = await newBusiness();
    await writeFallbackCalls(accountId, 4, 'own');
    const { health, mail } = healthWith({});
    expect((await health.checkFallbackStorms()).warned).toBe(0);
    await writeFallbackCalls(accountId, 1, 'own');
    expect((await health.checkFallbackStorms()).warned).toBe(1);
    expect(emailsTo(mail, manager)[0]?.subject).toBe('The AI keeps falling back for "Replying to customers"');
    expect(emailsTo(mail, manager)[0]?.text).toContain('your own keys');
    // the same hour again: one warning a day
    await health.checkFallbackStorms();
    expect(emailsTo(mail, manager)).toHaveLength(1);
  });

  it('warns the platform team, not the business, when the calls were on the platform’s keys', async () => {
    const { manager, accountId } = await newBusiness();
    await writeFallbackCalls(accountId, 6, 'platform', 'summarise');
    const { health, mail } = healthWith({});
    await health.checkFallbackStorms();
    expect(emailsTo(mail, manager)).toHaveLength(0);
    const toAdmin = emailsTo(mail, platformAdmin).filter((message) => message.subject.includes('Summaries'));
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0]?.text).toContain('Platform keys');
  });

  it('ignores calls older than an hour, and respects a business that switched warnings off', async () => {
    const old = await newBusiness();
    await writeFallbackCalls(old.accountId, 6, 'own');
    await database.system
      .updateTable('ai_calls')
      .set({ created_at: new Date(Date.now() - 2 * 3_600_000) })
      .where('account_id', '=', old.accountId)
      .execute();
    const silent = await newBusiness({ noticesEnabled: false });
    await writeFallbackCalls(silent.accountId, 6, 'own');
    const { health, mail } = healthWith({});
    await health.checkFallbackStorms();
    expect(emailsTo(mail, old.manager)).toHaveLength(0);
    expect(emailsTo(mail, silent.manager)).toHaveLength(0);
  });
});

describe('cleaning up old call records', () => {
  it('deletes call records older than 90 days and keeps the rest and all the daily totals', async () => {
    const { accountId } = await newBusiness();
    const write = (daysAgo: number) =>
      database.system
        .insertInto('ai_calls')
        .values({
          id: randomUUID(),
          account_id: accountId,
          task: 'chat_reply',
          agent_id: 'a',
          channel: 'c',
          prompt_version: 'p',
          provider: 'gemini',
          model_name: 'm',
          key_source: 'own',
          key_position: 1,
          success: true,
          attempt_count: 1,
          created_at: new Date(Date.now() - daysAgo * 86_400_000),
        })
        .execute();
    await write(91);
    await write(100);
    await write(89);
    await write(1);
    await database.system
      .insertInto('ai_usage')
      .values({
        account_id: accountId,
        day: '2020-01-01',
        provider: 'gemini',
        model_name: 'm',
        task: 't',
        agent_id: 'a',
        channel: 'c',
        key_source: 'own',
        calls: 5,
      })
      .execute();
    const { health } = healthWith({});
    expect(await health.cleanOldCalls()).toBeGreaterThanOrEqual(2);
    const left = await database.system
      .selectFrom('ai_calls')
      .select('id')
      .where('account_id', '=', accountId)
      .execute();
    expect(left).toHaveLength(2);
    expect(
      await database.system.selectFrom('ai_usage').select('calls').where('account_id', '=', accountId).execute(),
    ).toHaveLength(1);
  });
});

describe('the jobs the module declares', () => {
  const jobsByName = new Map((aiModule.jobs ?? []).map((job) => [job.name, job]));

  it('declares the nightly check, the per-business check, the hourly fallback watch and the nightly clean-up, on their schedules', () => {
    expect([...jobsByName.keys()].sort()).toEqual([
      'ai.check_business_keys',
      'ai.check_fallbacks',
      'ai.check_health',
      'ai.clean_old_calls',
    ]);
    expect(jobsByName.get('ai.check_health')?.schedule).toBe('15 2 * * *');
    expect(jobsByName.get('ai.check_fallbacks')?.schedule).toBe('5 * * * *');
    expect(jobsByName.get('ai.clean_old_calls')?.schedule).toBe('45 2 * * *');
    expect(jobsByName.get('ai.check_business_keys')?.schedule).toBeUndefined();
  });

  it('the nightly check tests the platform keys and queues one business check for every business', async () => {
    const mail = createRecordingMailSender();
    const queued: Array<{ name: string; data: unknown }> = [];
    const ids = ['11111111-1111-7111-8111-111111111111', '22222222-2222-7222-8222-222222222222'];
    await jobsByName.get('ai.check_health')?.run({
      data: {},
      accountContext: undefined,
      enqueueJob: async (name, data) => void queued.push({ name, data }),
      listAccountIds: async () => ids,
      logger: console as never,
      services: {
        config: {
          ...testConfig(),
          ai: { platformKeys: { gemini: [`job-${randomUUID()}`], openai: [], anthropic: [] } },
        },
        database,
        mail,
        llm: createScriptedLlmProvider(
          () => ({ answer: 'OK' }),
          () => [],
        ),
      },
    } satisfies JobRun);
    expect(queued).toEqual(ids.map((accountId) => ({ name: 'ai.check_business_keys', data: { accountId } })));
    expect((await database.system.selectFrom('ai_platform_key_checks').selectAll().execute()).length).toBe(1);
  });

  it('the per-business check refuses to run without a business', async () => {
    await expect(
      jobsByName.get('ai.check_business_keys')?.run({
        data: {},
        accountContext: undefined,
        enqueueJob: async () => {},
        listAccountIds: async () => [],
        logger: console as never,
        services: {} as never,
      }),
    ).rejects.toThrow('This job needs a business');
  });
});
