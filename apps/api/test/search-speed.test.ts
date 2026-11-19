import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner } from './support/team';

// F11: the search box answers within a second for a business with 50,000 contacts (docs/plan/PHASE-1.md, F11 tests).

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

describe('search with 50,000 contacts', () => {
  it('answers a name, a phone number and an email search in under a second each', { timeout: 120_000 }, async () => {
    const owner = await signUpOwner(app, database);
    // 50,000 people made by the database itself: names, unique phones and emails
    await sql`
      insert into app.contacts (id, account_id, name, phone, email)
      select gen_random_uuid(), ${owner.businessId}::uuid, 'Person ' || n || ' Menon',
             '+9198' || lpad(n::text, 8, '0'), 'person' || n || '@example.com'
      from generate_series(1, 50000) as n`.execute(database.system);
    await owner.ok('POST', '/contacts', { name: 'Rare Surname Valiyaveettil', phone: '+919847012345' }, 201);

    const timings: Record<string, number> = {};
    for (const [label, typed] of [
      ['name', 'valiyaveettil'],
      ['phone', '98470 12345'],
      ['email', 'person49999@'],
      ['common word', 'menon'],
    ] as const) {
      const startedAt = performance.now();
      const found = await owner.ok('GET', `/search?q=${encodeURIComponent(typed)}`);
      timings[label] = Math.round(performance.now() - startedAt);
      expect(found.contacts.length, label).toBeGreaterThan(0);
    }
    console.log('Search timings in milliseconds with 50,000 contacts:', JSON.stringify(timings));
    for (const label of Object.keys(timings)) expect(timings[label], label).toBeLessThan(1000);
  });
});
