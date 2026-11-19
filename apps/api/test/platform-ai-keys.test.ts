import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { poolFor } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let platformAdmin: SignedInPerson;
const platformKeys = {
  gemini: [`pk-gemini-${randomUUID()}`, `pk-gemini-${randomUUID()}`, `pk-gemini-${randomUUID()}`],
  openai: [`pk-openai-${randomUUID()}`],
  anthropic: [],
};

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], { config: { ...testConfig(), ai: { platformKeys } } });
  platformAdmin = await createSignedInPerson(app, database, { isPlatformAdmin: true });
});
afterAll(async () => {
  await database.system.deleteFrom('ai_platform_key_checks').execute();
  await app.close();
  await database.close();
});

const getKeys = (person: SignedInPerson | null) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/platform/ai/keys',
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

describe('GET /api/v1/platform/ai/keys', () => {
  it('lists every key by company and place in the list, unchecked until the daily check has looked, and never the key', async () => {
    await database.system.deleteFrom('ai_platform_key_checks').execute();
    const response = await getKeys(platformAdmin);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.keysPerProvider).toEqual({ gemini: 3, openai: 1, anthropic: 0 });
    expect(
      body.items.map((item: { provider: string; keyPosition: number }) => `${item.provider}#${item.keyPosition}`),
    ).toEqual(['gemini#1', 'gemini#2', 'gemini#3', 'openai#1']);
    expect(
      body.items.every(
        (item: { status: string; checkedAt: unknown }) => item.status === 'unchecked' && item.checkedAt === null,
      ),
    ).toBe(true);
    for (const key of [...platformKeys.gemini, ...platformKeys.openai]) expect(response.body).not.toContain(key);
  });

  it('shows what the daily check found, and ignores a check of a key that is no longer in the list', async () => {
    const checkedAt = new Date('2026-11-13T02:30:00Z');
    await database.system.deleteFrom('ai_platform_key_checks').execute();
    await database.system
      .insertInto('ai_platform_key_checks')
      .values([
        {
          provider: 'gemini',
          key_position: 1,
          status: 'working',
          status_note: 'Answered using a test model.',
          checked_at: checkedAt,
        },
        {
          provider: 'gemini',
          key_position: 2,
          status: 'failed',
          status_note: 'The AI company rejected this key.',
          checked_at: checkedAt,
        },
        { provider: 'gemini', key_position: 9, status: 'working', checked_at: checkedAt },
      ])
      .execute();
    const items = (await getKeys(platformAdmin)).json().items as Array<{
      provider: string;
      keyPosition: number;
      status: string;
      statusNote: string | null;
      checkedAt: string | null;
    }>;
    expect(items.find((item) => item.provider === 'gemini' && item.keyPosition === 1)).toMatchObject({
      status: 'working',
      statusNote: 'Answered using a test model.',
      checkedAt: checkedAt.toISOString(),
    });
    expect(items.find((item) => item.provider === 'gemini' && item.keyPosition === 2)).toMatchObject({
      status: 'failed',
    });
    expect(items.find((item) => item.provider === 'gemini' && item.keyPosition === 3)).toMatchObject({
      status: 'unchecked',
    });
    expect(items.some((item) => item.keyPosition === 9)).toBe(false);
  });

  it('shows when this copy of the API will use a resting key again', async () => {
    const pool = poolFor(platformKeys.openai);
    pool.markBad(1);
    const item = (await getKeys(platformAdmin))
      .json()
      .items.find((entry: { provider: string }) => entry.provider === 'openai');
    expect(item.restingUntil).not.toBeNull();
    expect(new Date(item.restingUntil).getTime()).toBeGreaterThan(Date.now());
    const untouched = (await getKeys(platformAdmin))
      .json()
      .items.find(
        (entry: { provider: string; keyPosition: number }) => entry.provider === 'gemini' && entry.keyPosition === 1,
      );
    expect(untouched.restingUntil).toBeNull();
  });

  it('answers 401 when nobody is signed in, and 403 to a business’s manager', async () => {
    expect((await getKeys(null)).statusCode).toBe(401);
    const manager = await createSignedInPerson(app, database);
    expect((await getKeys(manager)).statusCode).toBe(403);
  });
});

describe('the ai_platform_key_checks table', () => {
  it('can be read by the app role but not changed by it', async () => {
    const readable = await database.runInAccountTransaction(randomUUID(), (transaction) =>
      transaction.selectFrom('ai_platform_key_checks').select('provider').execute(),
    );
    expect(Array.isArray(readable)).toBe(true);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction
          .insertInto('ai_platform_key_checks')
          .values({ provider: 'gemini', key_position: 1, status: 'working' })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.deleteFrom('ai_platform_key_checks').execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a status or a position it does not know', async () => {
    await expect(
      database.system
        .insertInto('ai_platform_key_checks')
        .values({ provider: 'gemini', key_position: 1, status: 'weird' as never })
        .execute(),
    ).rejects.toThrow();
    await expect(
      database.system
        .insertInto('ai_platform_key_checks')
        .values({ provider: 'gemini', key_position: 0, status: 'working' })
        .execute(),
    ).rejects.toThrow();
  });
});
