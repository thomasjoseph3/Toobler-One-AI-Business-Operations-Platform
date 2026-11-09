import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

const LOCK_KEY = 72_000; // advisory lock: two servers starting together never migrate at once

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies db/migrations/*.sql in name order, each in its own transaction, and records it in app.schema_migrations with a
 * checksum. A migration that was applied and later edited is an error: changes are always a new numbered file.
 */
export async function migrate(pool: pg.Pool, dir: string, log: (line: string) => void = () => {}): Promise<MigrationResult> {
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const client = await pool.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('create schema if not exists app');
    await client.query(
      `create table if not exists app.schema_migrations (
         name text primary key, checksum text not null, applied_at timestamptz not null default now())`,
    );
    const done = new Map(
      (await client.query<{ name: string; checksum: string }>('select name, checksum from app.schema_migrations')).rows.map((r) => [
        r.name,
        r.checksum,
      ]),
    );
    for (const file of files) {
      const body = readFileSync(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const before = done.get(file);
      if (before) {
        if (before !== checksum) throw new Error(`Migration ${file} was changed after it was applied. Add a new migration instead.`);
        result.skipped.push(file);
        continue;
      }
      try {
        await client.query('begin');
        await client.query('set local search_path to app');
        await client.query(body);
        await client.query('insert into app.schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
      log(`applied ${file}`);
      result.applied.push(file);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return result;
}
