import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { forgotPasswordRequestSchema, okResponseSchema, resetPasswordRequestSchema } from '@toobler-one/shared';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createPasswordResetService } from '../services/password-reset.service';

/** Registers the password reset routes: POST /api/v1/auth/forgot-password and POST /api/v1/auth/reset-password. */
export function passwordResetRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mail } = app.kernel;
  const passwordResetService = createPasswordResetService({ config, database, mail, logger: app.log });

  // Open to anyone (the person cannot sign in), so it is listed in kernel/http/public-routes.ts. It answers 200 for any
  // valid-looking email, whether or not an account has it.
  typedApp.post(
    '/auth/forgot-password',
    {
      config: { access: 'public', ...routeLimit(app, 'forgotPassword') },
      schema: { body: forgotPasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await passwordResetService.sendResetLink(request.body.email);
      return { ok: true as const };
    },
  );

  // Open to anyone: the token from the emailed link is the proof. Listed in kernel/http/public-routes.ts.
  typedApp.post(
    '/auth/reset-password',
    {
      config: { access: 'public', ...routeLimit(app, 'resetPassword') },
      schema: { body: resetPasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await passwordResetService.resetPassword(request.body.token, request.body.newPassword);
      return { ok: true as const };
    },
  );
}
