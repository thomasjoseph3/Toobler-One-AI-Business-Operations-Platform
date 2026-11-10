import { Writable } from 'node:stream';
import { pino } from 'pino';
import { buildApp, type AppDeps } from '../../src/app';
import { loadConfig } from '../../src/kernel/config';
import type { Database } from '../../src/kernel/db';
import { PUBLIC_ROUTES } from '../../src/kernel/http/public-routes';
import { loggerOptions } from '../../src/kernel/logger';
import { createRegistry } from '../../src/kernel/modules/registry';
import { modules } from '../../src/modules';
import type { ModuleManifest } from '../../src/kernel/modules/define';
import { testDatabaseConfig } from './database';

/** The app settings used in tests: the test environment, pointing at the throwaway test database. */
export const testConfig = () => loadConfig({ NODE_ENV: 'test', DATABASE_URL: testDatabaseConfig().url });

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
  // The real open routes are always allowed; a test only adds the open routes of its own test modules.
  const publicRoutes = [...PUBLIC_ROUTES, ...(overrides.publicRoutes ?? [])];
  return buildApp({ config: testConfig(), database, registry, ...overrides, publicRoutes });
}
