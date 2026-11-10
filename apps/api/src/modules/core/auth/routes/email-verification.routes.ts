import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { okResponseSchema, verifyEmailRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createEmailVerificationService } from '../services/email-verification.service';

/** Registers the email routes: POST /api/v1/auth/verify-email and POST /api/v1/auth/resend-email. */
export function emailVerificationRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mail } = app.kernel;
  const emailVerificationService = createEmailVerificationService({ config, database, mail, logger: app.log });

  // Open to anyone: the link in the email is opened in a browser that may not be signed in (or on another device). The
  // token in the body is the proof. Listed in kernel/http/public-routes.ts.
  typedApp.post(
    '/auth/verify-email',
    {
      config: { access: 'public', ...routeLimit(app, 'verifyEmail') },
      schema: { body: verifyEmailRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await emailVerificationService.verify(request.body.token);
      return { ok: true as const };
    },
  );

  // For a signed-in person whose email is not verified yet (allowUnverified: that is the whole point of this route). It
  // only ever emails the person's own address, taken from their session, never from the request.
  typedApp.post(
    '/auth/resend-email',
    {
      config: { access: 'staff', allowUnverified: true, ...routeLimit(app, 'resendEmail') },
      schema: { response: { 200: okResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await emailVerificationService.resend(request.principal);
      return { ok: true as const };
    },
  );
}
