import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { okResponseSchema, profileResponseSchema, signInRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import {
  clearAuthCookies,
  readRefreshCookie,
  setAccessCookie,
  setAuthCookies,
  setRefreshCookie,
} from '../helpers/cookies';
import { createSessionsService, sessionEnded, type ClientInfo } from '../services/sessions.service';

/** Who is making the request, for the session record and the activity log. */
const clientOf = (request: FastifyRequest): ClientInfo => ({
  userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
  ip: request.ip,
});

/** Registers the session routes: POST /api/v1/auth/login, /auth/logout and /auth/refresh. */
export function sessionsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database } = app.kernel;
  const sessionsService = createSessionsService({ config, database });

  // Open to anyone (a person signing in has no session yet), so it is listed in kernel/http/public-routes.ts.
  // The answer is the profile; the tokens travel only in two httpOnly cookies and are never in the body.
  typedApp.post(
    '/auth/login',
    {
      config: { access: 'public' },
      schema: { body: signInRequestSchema, response: { 200: profileResponseSchema } },
    },
    async (request, reply) => {
      const { tokens, profile } = await sessionsService.signIn(
        request.body.email,
        request.body.password,
        clientOf(request),
      );
      setAuthCookies(reply, config, tokens);
      return profile;
    },
  );

  // For anyone signed in. The kernel's guard has already checked the cookie and the session before this runs. Like every
  // request that changes something, it needs our Origin and X-Requested-With headers (CSRF).
  typedApp.post(
    '/auth/logout',
    {
      config: { access: 'staff', allowUnverified: true },
      schema: { response: { 200: okResponseSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await sessionsService.signOut(request.principal, clientOf(request));
      clearAuthCookies(reply, config);
      return { ok: true as const };
    },
  );

  // Open to anyone: the access token has usually run out by now, so the refresh cookie is the proof. The browser sends that
  // cookie only to this address. Needs our CSRF headers like every change. Listed in kernel/http/public-routes.ts.
  // The answer is the profile; the new tokens travel only in cookies.
  typedApp.post(
    '/auth/refresh',
    { config: { access: 'public' }, schema: { response: { 200: profileResponseSchema } } },
    async (request, reply) => {
      const refreshToken = readRefreshCookie(request, config);
      if (!refreshToken) throw sessionEnded();
      const result = await sessionsService.refresh(refreshToken, clientOf(request));
      setAccessCookie(reply, config, result.accessToken);
      if (result.refreshToken) setRefreshCookie(reply, config, result.refreshToken);
      return result.profile;
    },
  );
}
