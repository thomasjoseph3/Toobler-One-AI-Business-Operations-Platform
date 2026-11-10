import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../kernel/config';
import { cookieNames } from './cookies';

const baseEnvironment = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x', JWT_SECRET: 'x'.repeat(32) };

describe('cookie names', () => {
  it('are plain in development and prefixed with __Secure- in production', () => {
    expect(cookieNames(loadConfig(baseEnvironment).env)).toEqual({
      access: 'toobler_access',
      refresh: 'toobler_refresh',
    });
    expect(cookieNames('production')).toEqual({
      access: '__Secure-toobler_access',
      refresh: '__Secure-toobler_refresh',
    });
  });
});
