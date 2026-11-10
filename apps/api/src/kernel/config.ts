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
  // Sign-in. The secret signs the access tokens: at least 32 characters, only ever in the environment, never shared.
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is missing. Run `npm run setup`, which adds a random one to .env.' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  // How long an access token works before the app must refresh it (minutes), and how long a session lasts at most (days)
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Email. `smtp` sends through a real mail server; `console` prints the email in the API's terminal (development only).
  // Left empty it is `smtp` when SMTP_HOST is set, otherwise `console`.
  MAIL_PROVIDER: z.enum(['smtp', 'console']).optional(),
  SMTP_HOST: z.string().default(''),
  // An empty SMTP_PORT in .env means "use the default"
  SMTP_PORT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65535).default(587),
  ),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  // The "From" line of every email, like: Toobler One <no-reply@yourdomain.com>
  EMAIL_FROM: z.string().default(''),
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
  auth: { jwtSecret: string; accessTokenMinutes: number; sessionMaxDays: number };
  mail: {
    provider: 'smtp' | 'console';
    from: string;
    smtp: { host: string; port: number; user: string; password: string };
  };
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
    auth: {
      jwtSecret: validEnvironment.JWT_SECRET,
      accessTokenMinutes: validEnvironment.ACCESS_TOKEN_MINUTES,
      sessionMaxDays: validEnvironment.SESSION_MAX_DAYS,
    },
    mail: {
      provider: validEnvironment.MAIL_PROVIDER ?? (validEnvironment.SMTP_HOST ? 'smtp' : 'console'),
      from: validEnvironment.EMAIL_FROM,
      smtp: {
        host: validEnvironment.SMTP_HOST,
        port: validEnvironment.SMTP_PORT,
        user: validEnvironment.SMTP_USER,
        password: validEnvironment.SMTP_PASS,
      },
    },
  };
  if (config.mail.provider === 'smtp' && (!config.mail.smtp.host || !config.mail.from)) {
    throw new ConfigError('Bad configuration:\n  MAIL_PROVIDER=smtp needs SMTP_HOST and EMAIL_FROM to be set');
  }
  if (config.env === 'production') {
    const unsafeSettings: string[] = [];
    if (config.db.ssl === 'off') unsafeSettings.push('DATABASE_SSL must be require or verify in production');
    if (!config.publicBaseUrl.startsWith('https://'))
      unsafeSettings.push('PUBLIC_BASE_URL must be https in production');
    if (!config.webUrl.startsWith('https://')) unsafeSettings.push('WEB_URL must be https in production');
    if (config.mail.provider === 'console') {
      unsafeSettings.push('MAIL_PROVIDER must be smtp in production (console would print working links in the log)');
    }
    if (unsafeSettings.length)
      throw new ConfigError(`Unsafe production configuration:\n  ${unsafeSettings.join('\n  ')}`);
  }
  return config;
}
