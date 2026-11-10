import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { profileResponseSchema, signUpRequestSchema } from '@toobler-one/shared';
import { createEmailVerificationService } from '../services/email-verification.service';
import { createSignUpService } from '../services/sign-up.service';

/** Registers the sign-up route: POST /api/v1/auth/signup. */
export function signUpRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mail } = app.kernel;
  const emailVerificationService = createEmailVerificationService({ config, database, mail, logger: app.log });
  const signUpService = createSignUpService({ database, emailVerificationService });

  // Open to anyone (a new owner has no account yet), so it is listed in kernel/http/public-routes.ts.
  // The body is checked against the shared schema before the handler runs; the answer is checked against the profile
  // schema on the way out, so a password hash can never be sent by mistake.
  typedApp.post(
    '/auth/signup',
    {
      config: { access: 'public' },
      schema: { body: signUpRequestSchema, response: { 201: profileResponseSchema } },
    },
    async (request, reply) => {
      const profile = await signUpService.signUp(request.body);
      return reply.code(201).send(profile);
    },
  );
}
