import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { profileResponseSchema, signInRequestSchema } from '@toobler-one/shared';
import { setAuthCookies } from './cookies';
import { createSessionsService, type ClientInfo } from './service';

/** Who is making the request, for the session record and the activity log. */
const clientOf = (request: FastifyRequest): ClientInfo => ({
  userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
  ip: request.ip,
});

/** Registers the sign-in route: POST /api/v1/auth/login. */
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
}
