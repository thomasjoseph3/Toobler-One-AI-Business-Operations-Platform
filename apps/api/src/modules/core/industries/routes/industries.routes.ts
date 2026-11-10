import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createIndustryRequestSchema, industriesResponseSchema, industrySchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { addIndustry, listIndustries } from '../services/industries.service';

/** Registers GET and POST /api/v1/industries. */
export function industriesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // Open to anyone: the sign-up form needs the list before anybody is signed in. It only reads, and it is listed in
  // kernel/http/public-routes.ts.
  typedApp.get(
    '/industries',
    { config: { access: 'public' }, schema: { response: { 200: industriesResponseSchema } } },
    async () => listIndustries(app.kernel.database),
  );

  // Platform admins only (a flag on the person, set in the database): for now this is the one thing that flag allows.
  // The kernel's guard has already checked the cookie, the session and the flag before this handler runs; a normal
  // business owner gets 403 and someone not signed in gets 401. Changes also need our Origin and header (CSRF).
  typedApp.post(
    '/industries',
    {
      config: { access: 'platform' },
      schema: { body: createIndustryRequestSchema, response: { 201: industrySchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const industry = await addIndustry(app.kernel.database, request.principal, request.body);
      return reply.code(201).send(industry);
    },
  );
}
