import { describe, expect, it } from 'vitest';
import { cookieNames } from './cookies';

describe('cookie names', () => {
  it('are plain in development and prefixed with __Secure- in production', () => {
    expect(cookieNames('development')).toEqual({ access: 'toobler_access', refresh: 'toobler_refresh' });
    expect(cookieNames('production')).toEqual({
      access: '__Secure-toobler_access',
      refresh: '__Secure-toobler_refresh',
    });
  });
});
