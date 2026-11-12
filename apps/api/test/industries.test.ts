import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
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

const getIndustries = () => app.inject('/api/v1/industries');

describe('GET /api/v1/industries', () => {
  it('lists the seeded industries without any sign-in, in the intended order', async () => {
    const response = await getIndustries();
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((industry: { id: string }) => industry.id)).toEqual([
      'general',
      'hotel_resort',
      'restaurant_cafe',
      'real_estate',
      'travel_agent',
      'wedding_planner',
      'clinic',
      'education',
      'car_dealer',
      'auto_service',
      'services',
      'salon_spa',
      'gym_fitness',
      'retail',
      'other',
    ]);
    expect(response.json().items[0]).toEqual({ id: 'general', label: 'General business' });
  });

  it('answers with only id and label, nothing else', async () => {
    const response = await getIndustries();
    for (const industry of response.json().items) expect(Object.keys(industry).sort()).toEqual(['id', 'label']);
  });

  it('follows the table: a new industry appears in its place, and a switched-off one disappears', async () => {
    const newId = `test_${randomUUID().slice(0, 8).replace(/-/g, '')}`;
    await database.system
      .insertInto('industries')
      .values({ id: newId, label: 'Test industry', sort_order: 15 })
      .execute();
    try {
      const ids = (await getIndustries()).json().items.map((industry: { id: string }) => industry.id);
      // Sort order 15 puts it between general (10) and hotel_resort (20)
      expect(ids.slice(0, 3)).toEqual(['general', newId, 'hotel_resort']);
    } finally {
      await database.system.deleteFrom('industries').where('id', '=', newId).execute();
    }
  });

  it('hides an industry that is switched off, and shows it again when it is switched back on', async () => {
    await database.system.updateTable('industries').set({ is_active: false }).where('id', '=', 'retail').execute();
    try {
      const hidden = (await getIndustries()).json().items.map((industry: { id: string }) => industry.id);
      expect(hidden).not.toContain('retail');
    } finally {
      await database.system.updateTable('industries').set({ is_active: true }).where('id', '=', 'retail').execute();
    }
    expect((await getIndustries()).json().items.map((industry: { id: string }) => industry.id)).toContain('retail');
  });
});

describe('the industries table', () => {
  it('can be read by the app role but not changed by it', async () => {
    const readable = await database.runInAccountTransaction(randomUUID(), (transaction) =>
      transaction.selectFrom('industries').select('id').execute(),
    );
    expect(readable.length).toBeGreaterThanOrEqual(8);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.insertInto('industries').values({ id: 'sneaky', label: 'Sneaky' }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.runInAccountTransaction(randomUUID(), (transaction) =>
        transaction.updateTable('industries').set({ label: 'Hacked' }).execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('only accepts ids written like "clinic" or "real_estate"', async () => {
    for (const badId of ['Clinic', 'has space', '1abc', 'a', 'x'.repeat(41)]) {
      await expect(
        database.system.insertInto('industries').values({ id: badId, label: 'Bad' }).execute(),
        badId,
      ).rejects.toThrow();
    }
  });

  it('is what a business points at: a business cannot be saved with an industry that does not exist', async () => {
    await expect(
      database.system
        .insertInto('accounts')
        .values({ id: randomUUID(), name: 'Orphan', industry: 'no_such_industry' })
        .execute(),
    ).rejects.toThrow(/foreign key/i);
  });
});

describe('the industries that have their own extra business questions', () => {
  it('all exist in the industries table (so a business can pick them at sign-up)', async () => {
    const { INDUSTRY_QUESTIONS } = await import('../src/modules/core/knowledge/helpers/industry-questions');
    const rows = await database.system.selectFrom('industries').select('id').where('is_active', '=', true).execute();
    const existing = new Set(rows.map((row) => row.id));
    const missing = Object.keys(INDUSTRY_QUESTIONS).filter((industryId) => !existing.has(industryId));
    expect(missing).toEqual([]);
  });
});
