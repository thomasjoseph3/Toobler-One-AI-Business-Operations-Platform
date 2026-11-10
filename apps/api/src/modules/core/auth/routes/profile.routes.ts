import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { profileResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createProfileService } from '../services/profile.service';

/** Registers GET /api/v1/me: who the signed-in person is, and their business. */
export function profileRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const profileService = createProfileService({ database: app.kernel.database });

  // For anyone signed in. It is the call the app's screens make to learn who is signed in. A plain read, so it does not
  // need the CSRF headers.
  typedApp.get(
    '/me',
    { config: { access: 'staff', allowUnverified: true }, schema: { response: { 200: profileResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return profileService.getProfile(request.principal);
    },
  );
}
