import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { changePasswordRequestSchema, okResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createPasswordService } from '../services/password.service';

/** Registers POST /api/v1/me/password: the signed-in person changes their own password. */
export function passwordRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const passwordService = createPasswordService({ database: app.kernel.database });

  // For a signed-in, verified person. The password changed is always the one in their session, never one named in the
  // request. Limited to 5 tries per 10 minutes, so a stolen session cannot be used to guess the current password.
  typedApp.post(
    '/me/password',
    {
      config: { access: 'staff', ...routeLimit(app, 'changePassword') },
      schema: { body: changePasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await passwordService.changePassword(request.principal, request.body.currentPassword, request.body.newPassword);
      return { ok: true as const };
    },
  );
}
