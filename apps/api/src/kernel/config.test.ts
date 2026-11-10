import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const minimalValidEnvironment = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x',
  JWT_SECRET: 'a-test-secret-that-is-long-enough-to-pass-32',
};

describe('loadConfig', () => {
  it('fills defaults', () => {
    const config = loadConfig(minimalValidEnvironment);
    expect(config).toMatchObject({
      env: 'development',
      port: 4000,
      host: '127.0.0.1',
      db: { ssl: 'off', poolSize: 6 },
      trustProxy: 'loopback',
      auth: { accessTokenMinutes: 15, sessionMaxDays: 30, sessionIdleDays: 7 },
    });
  });
  it('needs a database address', () => {
    expect(() => loadConfig({ JWT_SECRET: minimalValidEnvironment.JWT_SECRET })).toThrow(ConfigError);
    expect(() => loadConfig({ ...minimalValidEnvironment, DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
  it('needs a long enough JWT secret, and says how to get one', () => {
    expect(() => loadConfig({ DATABASE_URL: minimalValidEnvironment.DATABASE_URL })).toThrow(/npm run setup/);
    expect(() => loadConfig({ ...minimalValidEnvironment, JWT_SECRET: 'too-short' })).toThrow(/at least 32/);
  });
  it('never repeats the secret in an error message', () => {
    expect(() => loadConfig({ ...minimalValidEnvironment, JWT_SECRET: 'short-secret', PORT: 'abc' })).toThrow(
      expect.not.stringContaining('short-secret'),
    );
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
      EMAIL_FROM: 'Toobler One <no-reply@example.com>',
    });
    expect(safeProductionConfig.env).toBe('production');
  });
  it('production refuses the console mail sender, which would print working links in the log', () => {
    const productionWithoutMail = {
      ...minimalValidEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL: 'require',
      PUBLIC_BASE_URL: 'https://api.example.com',
      WEB_URL: 'https://app.example.com',
    };
    expect(() => loadConfig(productionWithoutMail)).toThrow(/MAIL_PROVIDER must be smtp/);
    expect(() => loadConfig({ ...productionWithoutMail, MAIL_PROVIDER: 'console' })).toThrow(
      /MAIL_PROVIDER must be smtp/,
    );
  });
  it('picks the mail sender from the settings, and never repeats the mail password in an error', () => {
    expect(loadConfig(minimalValidEnvironment).mail.provider).toBe('console'); // nothing set
    const withServer = loadConfig({ ...minimalValidEnvironment, SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'a@b.co' });
    expect(withServer.mail.provider).toBe('smtp');
    expect(withServer.mail.smtp.port).toBe(587); // an unset port uses the default
    expect(loadConfig({ ...minimalValidEnvironment, SMTP_PORT: '' }).mail.smtp.port).toBe(587); // an empty one too
    expect(loadConfig({ ...minimalValidEnvironment, MAIL_PROVIDER: 'console', SMTP_HOST: 'x' }).mail.provider).toBe(
      'console',
    );
    expect(() => loadConfig({ ...minimalValidEnvironment, MAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST and EMAIL_FROM/);
    expect(() =>
      loadConfig({
        ...minimalValidEnvironment,
        SMTP_HOST: 'h',
        EMAIL_FROM: 'f',
        SMTP_PASS: 'hunter2-secret',
        SMTP_PORT: 'abc',
      }),
    ).toThrow(expect.not.stringContaining('hunter2-secret'));
  });
});
