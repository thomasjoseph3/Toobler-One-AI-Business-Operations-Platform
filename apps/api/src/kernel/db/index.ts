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
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

function ssl({ ssl: mode, caFile }: Config['db']): false | pg.ClientConfig['ssl'] {
  if (mode === 'off') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}) };
}

export function createPool(db: Config['db']): pg.Pool {
  return new pg.Pool({
    connectionString: db.url,
    ssl: ssl(db),
    max: db.poolSize,
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
   * Runs `fn` in one transaction fenced to a business: it executes as `app_user` (which cannot bypass Row Level
   * Security) with `app.account_id` set, so a query that forgot its own WHERE still sees only that business's rows.
   * The role and the account are set per transaction, so nothing leaks to the next user of a pooled connection.
   */
  tx<T>(accountId: string, fn: (trx: Db) => Promise<T>): Promise<T>;
  /** One unfenced transaction (system work). */
  systemTx<T>(fn: (trx: Db) => Promise<T>): Promise<T>;
  /** Resolves when the database answers within 3 seconds. */
  ping(): Promise<void>;
  /** Start-up check that the roles are set up the way the fence needs. */
  verifyRoles(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(config: Config['db'], pool = createPool(config)): Database {
  const system = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  const tx: Database['tx'] = (accountId, fn) => {
    if (!isUuid(accountId)) throw new Error(`tx needs an account id (got "${String(accountId)}")`);
    return system.transaction().execute(async (trx) => {
      await sql`select set_config('app.account_id', ${accountId}, true)`.execute(trx);
      await sql`set local role app_user`.execute(trx);
      return fn(trx);
    });
  };

  return {
    pool,
    system,
    tx,
    systemTx: (fn) => system.transaction().execute(fn),
    async ping() {
      await Promise.race([
        pool.query('select 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('database timeout')), 3000).unref()),
      ]);
    },
    async verifyRoles() {
      const { rows } = await pool.query<{ ok: boolean }>(
        `select (rolsuper or rolbypassrls) as ok from pg_roles where rolname = current_user`,
      );
      if (!rows[0]?.ok) {
        throw new Error(
          'The database user must be able to bypass Row Level Security (a superuser or BYPASSRLS), because the event dispatcher and jobs read across businesses.',
        );
      }
      const app = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
        `select rolbypassrls, rolsuper from pg_roles where rolname = 'app_user'`,
      );
      if (!app.rows[0]) throw new Error('The app_user role is missing: run npm run db:migrate.');
      if (app.rows[0].rolbypassrls || app.rows[0].rolsuper) throw new Error('app_user must not bypass Row Level Security.');
    },
    close: async () => {
      await system.destroy(); // also ends the pool
    },
  };
}
