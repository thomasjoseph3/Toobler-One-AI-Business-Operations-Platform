// npm run db:migrate        applies db/migrations to DATABASE_URL (the development database)
// npm run db:migrate:test   applies them to the local test database
import path from 'node:path';
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createPool } from '../apps/api/src/kernel/db';
import { migrate } from '../apps/api/src/kernel/db/migrate';
import { testDatabaseConfig } from '../apps/api/test/support/database';

const test = process.argv.includes('--test');
if (!test) loadEnvFile();
const dbConfig = test ? testDatabaseConfig() : loadConfig().db;
const target = new URL(dbConfig.url);
console.log(`Migrating ${target.hostname}${target.pathname} ...`);
const pool = createPool(dbConfig);
try {
  const { applied, skipped } = await migrate(pool, path.resolve(import.meta.dirname, '../db/migrations'), (l) => console.log(' ', l));
  console.log(`Done: ${applied.length} applied, ${skipped.length} already up to date.`);
} finally {
  await pool.end();
}
