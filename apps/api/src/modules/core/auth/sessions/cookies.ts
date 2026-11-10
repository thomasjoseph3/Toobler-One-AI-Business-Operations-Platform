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

/** Sets the access cookie and the refresh cookie on the answer. */
export function setAuthCookies(
  reply: FastifyReply,
  config: Config,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const names = cookieNames(config.env);
  const shared = { httpOnly: true, sameSite: 'lax' as const, secure: config.env === 'production' };
  reply.setCookie(names.access, tokens.accessToken, {
    ...shared,
    path: ACCESS_COOKIE_PATH,
    maxAge: config.auth.accessTokenMinutes * 60,
  });
  reply.setCookie(names.refresh, tokens.refreshToken, {
    ...shared,
    path: REFRESH_COOKIE_PATH,
    maxAge: config.auth.sessionMaxDays * 24 * 60 * 60,
  });
}

/** The access token the browser sent, if any. */
export const readAccessCookie = (request: FastifyRequest, config: Config): string | undefined =>
  request.cookies[cookieNames(config.env).access];
