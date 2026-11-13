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
  // Development only: the address the API docs page (/docs) runs on. Requests from it are allowed to change data so
  // "Try it out" works. Ignored outside development, and production refuses to start when it is set.
  API_DOCS_ORIGIN: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  // Sign-in. The secret signs the access tokens: at least 32 characters, only ever in the environment, never shared.
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is missing. Run `npm run setup`, which adds a random one to .env.' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  // How long an access token works before the app must refresh it (minutes), and how long a session lasts at most (days)
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // A session nobody has refreshed for this many days ends, even before its maximum age
  SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
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
  // The platform's own AI keys, used for demos. Each may hold several keys separated by commas; a provider with no key is
  // simply not available. (GEMINI_API_KEY, with one key, is still read.) Never logged, never shown.
  GEMINI_API_KEYS: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  OPEN_AI_API_KEY: z.string().default(''),
  CLAUDE_API_KEY: z.string().default(''),
  // Scrambles the AI keys that businesses save (AES-256-GCM): 32 random bytes written in base64. `npm run setup` adds one. Lose it and
  // every saved business key becomes unreadable (the keys would have to be entered again). Never log it, never share it.
  SECRETS_ENCRYPTION_KEY: z.string().default(''),
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
  /** The address of the API docs page (development only). Null everywhere else: the docs page does not exist there. */
  docsOrigin: string | null;
  auth: { jwtSecret: string; accessTokenMinutes: number; sessionMaxDays: number; sessionIdleDays: number };
  mail: {
    provider: 'smtp' | 'console';
    from: string;
    smtp: { host: string; port: number; user: string; password: string };
  };
  /** The platform's own AI keys per provider (possibly none). The values are secrets: never log or return them. */
  ai: { platformKeys: { gemini: string[]; openai: string[]; anthropic: string[] } };
  /** The server's secret for scrambling saved keys, or null when none is set (then saving a key answers 503). */
  secrets: { encryptionKey: Buffer | null };
}

export class ConfigError extends Error {}

/** Turns "keyA, keyB,,keyA" into ["keyA", "keyB"]: split on commas, trimmed, no blanks, no repeats. */
function parseKeyList(...rawValues: string[]): string[] {
  const keys = rawValues.flatMap((rawValue) => rawValue.split(',')).map((key) => key.trim());
  return [...new Set(keys.filter((key) => key !== ''))];
}

/** Turns the SECRETS_ENCRYPTION_KEY setting into 32 bytes, or null when it is empty. Throws a ConfigError when it is the wrong size. */
function parseEncryptionKey(rawValue: string): Buffer | null {
  if (rawValue.trim() === '') return null;
  const keyBytes = Buffer.from(rawValue.trim(), 'base64');
  if (keyBytes.length !== 32) {
    // The value itself is never repeated in the message
    throw new ConfigError(
      'Bad configuration:\n  SECRETS_ENCRYPTION_KEY must be 32 random bytes written in base64 (npm run setup makes one)',
    );
  }
  return keyBytes;
}

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
    docsOrigin:
      validEnvironment.NODE_ENV === 'development'
        ? (validEnvironment.API_DOCS_ORIGIN ?? 'http://localhost:4000').replace(/\/$/, '')
        : null,
    auth: {
      jwtSecret: validEnvironment.JWT_SECRET,
      accessTokenMinutes: validEnvironment.ACCESS_TOKEN_MINUTES,
      sessionMaxDays: validEnvironment.SESSION_MAX_DAYS,
      sessionIdleDays: validEnvironment.SESSION_IDLE_DAYS,
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
    ai: {
      platformKeys: {
        gemini: parseKeyList(validEnvironment.GEMINI_API_KEYS, validEnvironment.GEMINI_API_KEY),
        openai: parseKeyList(validEnvironment.OPEN_AI_API_KEY),
        anthropic: parseKeyList(validEnvironment.CLAUDE_API_KEY),
      },
    },
    secrets: { encryptionKey: parseEncryptionKey(validEnvironment.SECRETS_ENCRYPTION_KEY) },
  };
  if (config.mail.provider === 'smtp' && (!config.mail.smtp.host || !config.mail.from)) {
    throw new ConfigError('Bad configuration:\n  MAIL_PROVIDER=smtp needs SMTP_HOST and EMAIL_FROM to be set');
  }
  if (config.env === 'production') {
    const unsafeSettings: string[] = [];
    if (validEnvironment.API_DOCS_ORIGIN) {
      unsafeSettings.push('API_DOCS_ORIGIN must not be set in production (it opens the API docs page to changes)');
    }
    if (config.db.ssl === 'off') unsafeSettings.push('DATABASE_SSL must be require or verify in production');
    if (!config.publicBaseUrl.startsWith('https://'))
      unsafeSettings.push('PUBLIC_BASE_URL must be https in production');
    if (!config.webUrl.startsWith('https://')) unsafeSettings.push('WEB_URL must be https in production');
    if (!config.secrets.encryptionKey) {
      unsafeSettings.push(
        'SECRETS_ENCRYPTION_KEY must be set in production (it scrambles the AI keys businesses save)',
      );
    }
    if (config.mail.provider === 'console') {
      unsafeSettings.push('MAIL_PROVIDER must be smtp in production (console would print working links in the log)');
    }
    if (unsafeSettings.length)
      throw new ConfigError(`Unsafe production configuration:\n  ${unsafeSettings.join('\n  ')}`);
  }
  return config;
}
