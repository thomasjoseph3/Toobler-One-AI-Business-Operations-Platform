import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const minimalValidEnvironment = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' };

describe('loadConfig', () => {
  it('fills defaults', () => {
    const config = loadConfig(minimalValidEnvironment);
    expect(config).toMatchObject({
      env: 'development',
      port: 4000,
      host: '127.0.0.1',
      db: { ssl: 'off', poolSize: 6 },
      trustProxy: 'loopback',
    });
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
    });
    expect(safeProductionConfig.env).toBe('production');
  });
});
