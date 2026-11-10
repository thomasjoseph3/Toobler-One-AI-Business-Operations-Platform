import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { okResponseSchema, profileResponseSchema, signInRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { clearAuthCookies, setAuthCookies } from '../helpers/cookies';
import { createSessionsService, type ClientInfo } from '../services/sessions.service';

/** Who is making the request, for the session record and the activity log. */
const clientOf = (request: FastifyRequest): ClientInfo => ({
  userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
  ip: request.ip,
});

/** Registers the sign-in and sign-out routes: POST /api/v1/auth/login and POST /api/v1/auth/logout. */
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
}
