import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { meResponseSchema, updateProfileRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createProfileService } from '../services/profile.service';

/** Registers GET /api/v1/me (who the signed-in person is, their business and its active modules) and PATCH /api/v1/me (change own details). */
export function profileRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const profileService = createProfileService({ database: app.kernel.database });

  // For anyone signed in. It is the call the app's screens make to learn who is signed in. A plain read, so it does not
  // need the CSRF headers.
  typedApp.get(
    '/me',
    { config: { access: 'staff', allowUnverified: true }, schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return profileService.getProfile(request.principal);
    },
  );

  // For a signed-in, verified person. Changes only their own name and/or mobile number: the person comes from the session,
  // never from the request, and the body may not name anything else (email, role, business are refused).
  typedApp.patch(
    '/me',
    {
      config: { access: 'staff' },
      schema: { body: updateProfileRequestSchema, response: { 200: meResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return profileService.updateProfile(request.principal, request.body);
    },
  );
}
