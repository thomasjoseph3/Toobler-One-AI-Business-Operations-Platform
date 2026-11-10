import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// The only file that reads process.env (lint-enforced). Everything is checked at start-up; production refuses to start
// on a bad setting rather than run half-open.

const repositoryRootDirectory = path.resolve(import.meta.dirname, '../../../..');

/** Loads the repo's .env into process.env (without overriding variables already set). Never in tests. */
export function loadEnvFile(environmentFilePath = path.join(repositoryRootDirectory, '.env')): void {
  if (process.env.NODE_ENV === 'test' || !existsSync(environmentFilePath)) return;
  process.loadEnvFile(environmentFilePath);
}

/** The environment variables the app understands, with their allowed values and defaults. */
const EnvironmentVariablesSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// address'),
  DATABASE_SSL: z.enum(['off', 'require', 'verify']).default('off'),
  DATABASE_CA_FILE: z.string().default(''),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(6),
  // Which proxies may tell us the caller's address (X-Forwarded-For). Never trust it from anyone else.
  TRUST_PROXY: z.string().default('loopback'),
  WEB_URL: z.url().default('http://localhost:3000'),
  PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
  // Sign-in (F01). The secret signs access tokens: at least 32 characters, only ever in the environment.
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is missing. Run `npm run setup`, which adds a random one to .env.' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Multiplies the limits on the sign-in routes (tests raise it; leave it at 1 everywhere else).
  AUTH_RATE_LIMIT_SCALE: z.coerce.number().min(1).max(10_000).default(1),
  // Email. `smtp` sends for real; `console` prints the link to the log (development only). Default: smtp when SMTP_HOST is set.
  MAIL_PROVIDER: z.enum(['smtp', 'console']).optional(),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('Toobler One <no-reply@localhost>'),
  // The country code added to mobile numbers typed without one (91 = India)
  DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,3}$/, 'DEFAULT_COUNTRY_CODE must be digits, like 91')
    .default('91'),
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
  defaultCountryCode: string;
  auth: {
    jwtSecret: string;
    accessTokenMinutes: number;
    sessionIdleDays: number;
    sessionMaxDays: number;
    rateLimitScale: number;
  };
  mail: { provider: 'smtp' | 'console'; host: string; port: number; user: string; password: string; from: string };
}

export class ConfigError extends Error {}

/** Turns the TRUST_PROXY setting into what Fastify expects: false, a single address, or a list of addresses. */
function parseTrustProxy(rawValue: string): boolean | string | string[] {
  const trimmedValue = rawValue.trim();
  if (trimmedValue === 'none' || trimmedValue === 'false' || trimmedValue === '') return false;
  if (trimmedValue === 'true')
    throw new ConfigError(
      'TRUST_PROXY=true trusts anyone who sends X-Forwarded-For. Use loopback or a list of proxy IPs.',
    );
  return trimmedValue.includes(',') ? trimmedValue.split(',').map((address) => address.trim()) : trimmedValue;
}

/**
 * Checks the environment variables and returns the app's settings. Throws a ConfigError listing every problem, so the
 * app refuses to start on a bad setting instead of running half-configured.
 */
export function loadConfig(environmentVariables: Record<string, string | undefined> = process.env): Config {
  const parseResult = EnvironmentVariablesSchema.safeParse(environmentVariables);
  if (!parseResult.success) {
    const problemLines = parseResult.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Bad configuration:\n${problemLines.join('\n')}`);
  }
  const validEnvironment = parseResult.data;
  const config: Config = {
    env: validEnvironment.NODE_ENV,
    port: validEnvironment.PORT,
    host: validEnvironment.HOST,
    logLevel: validEnvironment.LOG_LEVEL,
    db: {
      url: validEnvironment.DATABASE_URL,
      ssl: validEnvironment.DATABASE_SSL,
      caFile: validEnvironment.DATABASE_CA_FILE,
      poolSize: validEnvironment.DATABASE_POOL_SIZE,
    },
    trustProxy: parseTrustProxy(validEnvironment.TRUST_PROXY),
    webUrl: validEnvironment.WEB_URL.replace(/\/$/, ''),
    publicBaseUrl: validEnvironment.PUBLIC_BASE_URL.replace(/\/$/, ''),
    defaultCountryCode: validEnvironment.DEFAULT_COUNTRY_CODE,
    auth: {
      jwtSecret: validEnvironment.JWT_SECRET,
      accessTokenMinutes: validEnvironment.ACCESS_TOKEN_MINUTES,
      sessionIdleDays: validEnvironment.SESSION_IDLE_DAYS,
      sessionMaxDays: validEnvironment.SESSION_MAX_DAYS,
      rateLimitScale: validEnvironment.AUTH_RATE_LIMIT_SCALE,
    },
    mail: {
      provider: validEnvironment.MAIL_PROVIDER ?? (validEnvironment.SMTP_HOST ? 'smtp' : 'console'),
      host: validEnvironment.SMTP_HOST,
      port: validEnvironment.SMTP_PORT,
      user: validEnvironment.SMTP_USER,
      password: validEnvironment.SMTP_PASS,
      from: validEnvironment.EMAIL_FROM,
    },
  };
  if (config.env === 'production') {
    const unsafeSettings: string[] = [];
    if (config.db.ssl === 'off') unsafeSettings.push('DATABASE_SSL must be require or verify in production');
    if (!config.publicBaseUrl.startsWith('https://'))
      unsafeSettings.push('PUBLIC_BASE_URL must be https in production');
    if (!config.webUrl.startsWith('https://')) unsafeSettings.push('WEB_URL must be https in production');
    if (config.mail.provider !== 'smtp' || !config.mail.host)
      unsafeSettings.push(
        'Email must use smtp with SMTP_HOST set in production (the console provider only prints links)',
      );
    if (config.auth.rateLimitScale !== 1) unsafeSettings.push('AUTH_RATE_LIMIT_SCALE must stay 1 in production');
    if (unsafeSettings.length)
      throw new ConfigError(`Unsafe production configuration:\n  ${unsafeSettings.join('\n  ')}`);
  }
  return config;
}
