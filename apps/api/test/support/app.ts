import { Writable } from 'node:stream';
import { pino } from 'pino';
import { buildApp, type AppDeps } from '../../src/app';
import { loadConfig } from '../../src/kernel/config';
import type { Database } from '../../src/kernel/db';
import { loggerOptions } from '../../src/kernel/logger';
import { createRegistry } from '../../src/kernel/modules/registry';
import { modules } from '../../src/modules';
import type { ModuleManifest } from '../../src/kernel/modules/define';
import { testDatabaseConfig } from './database';

/** The app settings used in tests: the test environment, pointing at the throwaway test database. */
export const TEST_WEB_ORIGIN = 'http://localhost:3000';
/** The headers our web app adds to every request that changes something (the CSRF check refuses requests without them). */
export const unsafeRequestHeaders = { origin: TEST_WEB_ORIGIN, 'x-requested-with': 'toobler-web' };
export const testConfig = (extraSettings: Record<string, string> = {}) =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseConfig().url,
    JWT_SECRET: 'test-only-secret-test-only-secret-test-only',
    WEB_URL: TEST_WEB_ORIGIN,
    // Every test calls from 127.0.0.1, so the sign-in limits are raised; one test builds an app with the real limits.
    AUTH_RATE_LIMIT_SCALE: '1000',
    ...extraSettings,
  });

/** A logger that keeps its lines, so a test can check what was (and was not) written to the log. */
export function captureLogs() {
  const loggedLines: string[] = [];
  const captureStream = new Writable({
    write(chunk, _encoding, finishedWriting) {
      loggedLines.push(String(chunk));
      finishedWriting();
    },
  });
  const logger = pino({ ...loggerOptions({ logLevel: 'info', env: 'development' }) }, captureStream);
  return { logger, text: () => loggedLines.join('') };
}

/** The real app on the test database, plus any extra modules the test brings. */
export async function buildTestApp(
  database: Database,
  extraModules: ModuleManifest[] = [],
  overrides: Partial<AppDeps> = {},
) {
  const registry = createRegistry([...modules, ...extraModules]);
  return buildApp({ config: testConfig(), database, registry, ...overrides });
}
