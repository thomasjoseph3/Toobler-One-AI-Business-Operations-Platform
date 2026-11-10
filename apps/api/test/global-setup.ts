import { createPool } from '../src/kernel/db';
import { migrate } from '../src/kernel/db/migrate';
import { migrationsDir, testDatabaseConfig } from './support/database';

// Runs once before all API tests: a clean "app" schema with every migration applied.
export default async function setup() {
  const pool = createPool(testDatabaseConfig());
  try {
    await pool.query('select 1');
  } catch (error) {
    await pool.end();
    throw new Error(`The test database isn't reachable (${(error as Error).message}). Start it with: npm run db:up`, {
      cause: error,
    });
  }
  await pool.query('drop schema if exists app cascade');
  await migrate(pool, migrationsDir);
  await pool.end();
}
