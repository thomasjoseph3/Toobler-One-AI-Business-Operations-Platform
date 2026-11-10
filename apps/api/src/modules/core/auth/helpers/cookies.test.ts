import { describe, expect, it } from 'vitest';
import { cookieNames, readRefreshCookie } from './cookies';

describe('cookie names', () => {
  it('are plain in development and prefixed with __Secure- in production', () => {
    expect(cookieNames('development')).toEqual({ access: 'toobler_access', refresh: 'toobler_refresh' });
    expect(cookieNames('production')).toEqual({
      access: '__Secure-toobler_access',
      refresh: '__Secure-toobler_refresh',
    });
  });
});

describe('readRefreshCookie', () => {
  it('reads the refresh cookie by its name for the environment', () => {
    const request = { cookies: { toobler_refresh: 'abc', '__Secure-toobler_refresh': 'prod' } } as never;
    expect(readRefreshCookie(request, { env: 'development' } as never)).toBe('abc');
    expect(readRefreshCookie(request, { env: 'production' } as never)).toBe('prod');
    expect(readRefreshCookie({ cookies: {} } as never, { env: 'development' } as never)).toBeUndefined();
  });
});
