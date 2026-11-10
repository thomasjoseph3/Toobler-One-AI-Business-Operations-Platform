import path from 'node:path';
import type { Config } from '../../src/kernel/config';

export const migrationsDir = path.resolve(import.meta.dirname, '../../../../db/migrations');

const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/toobler_test';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * The throwaway database tests run on. Refuses any host that isn't this machine, so a test can never touch the
 * development (Supabase) database or anything real, whatever DATABASE_URL says.
 */
export function testDatabaseConfig(): Config['db'] {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_URL;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run tests on "${host}": TEST_DATABASE_URL must point at this machine (npm run db:up).`,
    );
  }
  return { url, ssl: 'off', caFile: '', poolSize: 5 };
}
