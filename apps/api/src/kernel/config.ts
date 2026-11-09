import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// The only file that reads process.env (lint-enforced). Everything is checked at start-up; production refuses to start
// on a bad setting rather than run half-open.

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/** Loads the repo's .env into process.env (without overriding variables already set). Never in tests. */
export function loadEnvFile(file = path.join(repoRoot, '.env')): void {
  if (process.env.NODE_ENV === 'test' || !existsSync(file)) return;
  process.loadEnvFile(file);
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// address'),
  DATABASE_SSL: z.enum(['off', 'require', 'verify']).default('off'),
  DATABASE_CA_FILE: z.string().default(''),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(6),
  // Which proxies may tell us the caller's address (X-Forwarded-For). Never trust it from anyone else.
  TRUST_PROXY: z.string().default('loopback'),
  WEB_URL: z.url().default('http://localhost:3000'),
  PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  db: { url: string; ssl: 'off' | 'require' | 'verify'; caFile: string; poolSize: number };
  trustProxy: boolean | string | string[];
  webUrl: string;
  publicBaseUrl: string;
}

export class ConfigError extends Error {}

function parseTrustProxy(value: string): boolean | string | string[] {
  const v = value.trim();
  if (v === 'none' || v === 'false' || v === '') return false;
  if (v === 'true') throw new ConfigError('TRUST_PROXY=true trusts anyone who sends X-Forwarded-For. Use loopback or a list of proxy IPs.');
  return v.includes(',') ? v.split(',').map((x) => x.trim()) : v;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Bad configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const config: Config = {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    db: { url: e.DATABASE_URL, ssl: e.DATABASE_SSL, caFile: e.DATABASE_CA_FILE, poolSize: e.DATABASE_POOL_SIZE },
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    webUrl: e.WEB_URL.replace(/\/$/, ''),
    publicBaseUrl: e.PUBLIC_BASE_URL.replace(/\/$/, ''),
  };
  if (config.env === 'production') {
    const problems: string[] = [];
    if (config.db.ssl === 'off') problems.push('DATABASE_SSL must be require or verify in production');
    if (!config.publicBaseUrl.startsWith('https://')) problems.push('PUBLIC_BASE_URL must be https in production');
    if (!config.webUrl.startsWith('https://')) problems.push('WEB_URL must be https in production');
    if (problems.length) throw new ConfigError(`Unsafe production configuration:\n  ${problems.join('\n  ')}`);
  }
  return config;
}
