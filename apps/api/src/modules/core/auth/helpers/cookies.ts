import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../../../kernel/config';

// The two sign-in cookies. Both are httpOnly (browser scripts cannot read them) and SameSite=Lax; in production they are
// also Secure and carry the `__Secure-` prefix. The refresh cookie is only ever sent to the refresh address.
const ACCESS_COOKIE_PATH = '/api';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

/** The names of the two cookies. */
export const cookieNames = (environment: Config['env']) => {
  const prefix = environment === 'production' ? '__Secure-' : '';
  return { access: `${prefix}toobler_access`, refresh: `${prefix}toobler_refresh` };
};

/** The settings both cookies share: unreadable by scripts, not sent from other sites, and Secure in production. */
const sharedCookieOptions = (config: Config) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.env === 'production',
});

/** Sets the access cookie on the answer. */
export function setAccessCookie(reply: FastifyReply, config: Config, accessToken: string): void {
  reply.setCookie(cookieNames(config.env).access, accessToken, {
    ...sharedCookieOptions(config),
    path: ACCESS_COOKIE_PATH,
    maxAge: config.auth.accessTokenMinutes * 60,
  });
}

/** Sets the refresh cookie on the answer. */
export function setRefreshCookie(reply: FastifyReply, config: Config, refreshToken: string): void {
  reply.setCookie(cookieNames(config.env).refresh, refreshToken, {
    ...sharedCookieOptions(config),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.auth.sessionMaxDays * 24 * 60 * 60,
  });
}

/** Sets the access cookie and the refresh cookie on the answer. */
export function setAuthCookies(
  reply: FastifyReply,
  config: Config,
  tokens: { accessToken: string; refreshToken: string },
): void {
  setAccessCookie(reply, config, tokens.accessToken);
  setRefreshCookie(reply, config, tokens.refreshToken);
}

/** Removes both cookies from the browser (sign-out). The path must match the one they were set with. */
export function clearAuthCookies(reply: FastifyReply, config: Config): void {
  const names = cookieNames(config.env);
  reply.clearCookie(names.access, { path: ACCESS_COOKIE_PATH });
  reply.clearCookie(names.refresh, { path: REFRESH_COOKIE_PATH });
}

/** The access token the browser sent, if any. */
export const readAccessCookie = (request: FastifyRequest, config: Config): string | undefined =>
  request.cookies[cookieNames(config.env).access];

/** The refresh token the browser sent, if any. The browser sends it only to the refresh address. */
export const readRefreshCookie = (request: FastifyRequest, config: Config): string | undefined =>
  request.cookies[cookieNames(config.env).refresh];
