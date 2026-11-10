// npm run db:migrate        applies db/migrations to DATABASE_URL (the development database)
// npm run db:migrate:test   applies them to the local test database
import path from 'node:path';
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createPool } from '../apps/api/src/kernel/database';
import { migrate } from '../apps/api/src/kernel/database/migrate';
import { testDatabaseConfig } from '../apps/api/test/support/database';

const useTestDatabase = process.argv.includes('--test');
if (!useTestDatabase) loadEnvFile();
const databaseConfig = useTestDatabase ? testDatabaseConfig() : loadConfig().db;
const databaseAddress = new URL(databaseConfig.url);
console.log(`Migrating ${databaseAddress.hostname}${databaseAddress.pathname} ...`);
const pool = createPool(databaseConfig);
try {
  const { applied, skipped } = await migrate(pool, path.resolve(import.meta.dirname, '../db/migrations'), (line) =>
    console.log(' ', line),
  );
  console.log(`Done: ${applied.length} applied, ${skipped.length} already up to date.`);
} finally {
  await pool.end();
}
