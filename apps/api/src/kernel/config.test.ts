import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const TEST_JWT_SECRET = 'a-test-secret-that-is-long-enough-to-pass-32';
const minimalValidEnvironment = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x', JWT_SECRET: TEST_JWT_SECRET };

describe('loadConfig', () => {
  it('fills defaults', () => {
    const config = loadConfig(minimalValidEnvironment);
    expect(config).toMatchObject({
      env: 'development',
      port: 4000,
      host: '127.0.0.1',
      db: { ssl: 'off', poolSize: 6 },
      trustProxy: 'loopback',
      defaultCountryCode: '91',
      auth: { accessTokenMinutes: 15, sessionIdleDays: 7, sessionMaxDays: 30, rateLimitScale: 1 },
      mail: { provider: 'console' },
    });
  });
  it('needs a long enough JWT secret and says how to get one', () => {
    expect(() => loadConfig({ DATABASE_URL: minimalValidEnvironment.DATABASE_URL })).toThrow(/npm run setup/);
    expect(() => loadConfig({ ...minimalValidEnvironment, JWT_SECRET: 'too-short' })).toThrow(/at least 32/);
  });
  it('sends email by smtp when SMTP_HOST is set, and keeps the password out of the error text', () => {
    const config = loadConfig({ ...minimalValidEnvironment, SMTP_HOST: 'smtp.example.com', SMTP_PASS: 'hunter2' });
    expect(config.mail).toMatchObject({ provider: 'smtp', host: 'smtp.example.com', port: 587 });
    expect(() => loadConfig({ ...minimalValidEnvironment, SMTP_PORT: 'abc', SMTP_PASS: 'hunter2' })).toThrow(
      expect.not.stringContaining('hunter2'),
    );
  });
  it('needs a database address', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
  it('refuses to trust every proxy', () => {
    expect(() => loadConfig({ ...minimalValidEnvironment, TRUST_PROXY: 'true' })).toThrow(/trusts anyone/);
    expect(loadConfig({ ...minimalValidEnvironment, TRUST_PROXY: 'none' }).trustProxy).toBe(false);
    expect(loadConfig({ ...minimalValidEnvironment, TRUST_PROXY: '10.0.0.1, 10.0.0.2' }).trustProxy).toEqual([
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });
  it('refuses an unsafe production setup', () => {
    expect(() => loadConfig({ ...minimalValidEnvironment, NODE_ENV: 'production' })).toThrow(
      /DATABASE_SSL.*PUBLIC_BASE_URL/s,
    );
    const safeProductionConfig = loadConfig({
      ...minimalValidEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL: 'require',
      PUBLIC_BASE_URL: 'https://api.example.com',
      WEB_URL: 'https://app.example.com',
      SMTP_HOST: 'smtp.example.com',
    });
    expect(safeProductionConfig.env).toBe('production');
  });
  it('in production needs a real mail server and the normal rate limits', () => {
    const productionEnvironment = {
      ...minimalValidEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL: 'require',
      PUBLIC_BASE_URL: 'https://api.example.com',
      WEB_URL: 'https://app.example.com',
    };
    expect(() => loadConfig(productionEnvironment)).toThrow(/smtp with SMTP_HOST/);
    expect(() =>
      loadConfig({ ...productionEnvironment, SMTP_HOST: 'smtp.example.com', AUTH_RATE_LIMIT_SCALE: '1000' }),
    ).toThrow(/AUTH_RATE_LIMIT_SCALE/);
    expect(loadConfig({ ...productionEnvironment, SMTP_HOST: 'smtp.example.com' }).mail.provider).toBe('smtp');
  });
});
