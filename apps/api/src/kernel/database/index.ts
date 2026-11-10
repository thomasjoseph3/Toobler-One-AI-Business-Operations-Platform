import fs from 'node:fs';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Config } from '../config';
import { isUuid } from '../ids';
import type { DB } from './types';

export type { DB } from './types';
/** A Kysely handle or a transaction on it: repositories take this and don't care which. */
export type Db = Kysely<DB>;

// Dates stay 'YYYY-MM-DD' strings (never shifted by a time zone), counts and amounts come back as numbers.
pg.types.setTypeParser(pg.types.builtins.DATE, (databaseValue) => databaseValue);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (databaseValue) => Number(databaseValue));
pg.types.setTypeParser(pg.types.builtins.INT8, (databaseValue) => Number(databaseValue));

/**
 * Turns the DATABASE_SSL setting into the connection-encryption options the pg library expects:
 * 'off' = no encryption, 'require' = encrypted but the server's certificate is not checked,
 * 'verify' = encrypted and the certificate is checked (against the CA file when one is given).
 */
export function buildSslOptions({ ssl: sslMode, caFile }: Config['db']): false | pg.ClientConfig['ssl'] {
  if (sslMode === 'off') return false;
  if (sslMode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}) };
}

/** Creates the pool of reusable Postgres connections that every database call shares. */
export function createPool(databaseConfig: Config['db']): pg.Pool {
  return new pg.Pool({
    connectionString: databaseConfig.url,
    ssl: buildSslOptions(databaseConfig),
    max: databaseConfig.poolSize,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    // Tables are named without the schema in queries
    options: '-c search_path=app',
  });
}

export interface Database {
  readonly pool: pg.Pool;
  /**
   * The database owner: it bypasses Row Level Security. For migrations, background jobs, the event dispatcher and the
   * few named cross-business lookups. Only repositories and the kernel may use it (lint-enforced).
   */
  readonly system: Db;
  /**
   * Runs `work` in one transaction fenced to a business: it executes as `app_user` (which cannot bypass Row Level
   * Security) with `app.account_id` set, so a query that forgot its own WHERE still sees only that business's rows.
   * The role and the account are set per transaction, so nothing leaks to the next user of a pooled connection.
   */
  runInAccountTransaction<Result>(accountId: string, work: (transaction: Db) => Promise<Result>): Promise<Result>;
  /** One unfenced transaction (system work). */
  runInSystemTransaction<Result>(work: (transaction: Db) => Promise<Result>): Promise<Result>;
  /** Resolves when the database answers within 3 seconds. */
  ping(): Promise<void>;
  /** Start-up check that the roles are set up the way the fence needs. */
  verifyRoles(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates the database handle the whole app uses: the owner connection (`system`), the fenced per-business transaction,
 * the unfenced system transaction, and the start-up checks. `pool` can be passed in by tests.
 */
export function createDatabase(databaseConfig: Config['db'], pool = createPool(databaseConfig)): Database {
  const system = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  // Opens a transaction, tells Postgres which business it belongs to, drops to the restricted `app_user` role, then runs
  // the caller's `work`. Both settings last only for this transaction, so a pooled connection never carries them over.
  const runInAccountTransaction: Database['runInAccountTransaction'] = (accountId, work) => {
    if (!isUuid(accountId)) throw new Error(`runInAccountTransaction needs an account id (got "${String(accountId)}")`);
    return system.transaction().execute(async (transaction) => {
      await sql`select set_config('app.account_id', ${accountId}, true)`.execute(transaction);
      await sql`set local role app_user`.execute(transaction);
      return work(transaction);
    });
  };

  return {
    pool,
    system,
    runInAccountTransaction,
    runInSystemTransaction: (work) => system.transaction().execute(work),
    async ping() {
      await Promise.race([
        pool.query('select 1'),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('database timeout')), 3000).unref()),
      ]);
    },
    async verifyRoles() {
      const { rows: currentUserRows } = await pool.query<{ ok: boolean }>(
        `select (rolsuper or rolbypassrls) as ok from pg_roles where rolname = current_user`,
      );
      if (!currentUserRows[0]?.ok) {
        throw new Error(
          'The database user must be able to bypass Row Level Security (a superuser or BYPASSRLS), because the event dispatcher and jobs read across businesses.',
        );
      }
      const { rows: appUserRows } = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
        `select rolbypassrls, rolsuper from pg_roles where rolname = 'app_user'`,
      );
      if (!appUserRows[0]) throw new Error('The app_user role is missing: run npm run db:migrate.');
      if (appUserRows[0].rolbypassrls || appUserRows[0].rolsuper)
        throw new Error('app_user must not bypass Row Level Security.');
    },
    close: async () => {
      await system.destroy(); // also ends the pool
    },
  };
}
