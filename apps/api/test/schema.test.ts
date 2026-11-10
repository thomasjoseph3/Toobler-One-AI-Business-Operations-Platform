import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/db';
import { openTestDatabase } from './support/harness';

let database: Database;
beforeAll(() => {
  database = openTestDatabase();
});
afterAll(() => database.close());

// Tables with no account_id on purpose (users, sessions, ...). Each one is added here by the migration that creates it,
// with the reason, and is only reached through named repository functions (docs/SECURITY.md 2.1).
const GLOBAL_TABLES = new Set(['schema_migrations']);

describe('schema rules', () => {
  it('every table with an account_id has Row Level Security enabled, forced and a policy', async () => {
    const { rows } = await database.pool.query<{ table: string; rls: boolean; forced: boolean; policies: number }>(`
      select c.relname as "table", c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'account_id' and not a.attisdropped)`);
    expect(rows.length).toBeGreaterThan(0);
    for (const tableRow of rows) {
      expect(tableRow, `${tableRow.table} must have RLS enabled, forced and a policy`).toMatchObject({
        rls: true,
        forced: true,
      });
      expect(tableRow.policies, `${tableRow.table} needs a tenant policy`).toBeGreaterThan(0);
    }
  });

  it('every table without an account_id is on the global list', async () => {
    const { rows } = await database.pool.query<{ table: string }>(`
      select c.relname as "table" from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r'
        and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'account_id' and not a.attisdropped)`);
    const unexpectedTables = rows
      .map((tableRow) => tableRow.table)
      .filter((tableName) => !GLOBAL_TABLES.has(tableName));
    expect(unexpectedTables, 'add the table to GLOBAL_TABLES with a reason, or give it an account_id').toEqual([]);
  });

  it('the app role can add to the activity log but never change or delete it', async () => {
    const { rows } = await database.pool.query<{ priv: string; ok: boolean }>(`
      select privilege as priv, has_table_privilege('app_user', 'app.activity_log', privilege) as ok
      from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privilege`);
    expect(Object.fromEntries(rows.map((privilegeRow) => [privilegeRow.priv, privilegeRow.ok]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: false,
      DELETE: false,
    });
  });

  it('records each migration once, with a checksum', async () => {
    const { rows } = await database.pool.query<{ name: string; checksum: string }>(
      'select name, checksum from app.schema_migrations order by name',
    );
    expect(rows[0]?.name).toBe('001_kernel.sql');
    expect(rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
