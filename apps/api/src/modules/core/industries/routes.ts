import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { industriesResponseSchema } from '@toobler-one/shared';
import { listIndustries } from './service';

/** Registers GET /api/v1/industries. (Adding an industry comes later, once platform admins can sign in.) */
export function industriesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // Open to anyone: the sign-up form needs the list before anybody is signed in. It only reads, and it is listed in
  // kernel/http/public-routes.ts.
  typedApp.get(
    '/industries',
    { config: { access: 'public' }, schema: { response: { 200: industriesResponseSchema } } },
    async () => listIndustries(app.kernel.database),
  );
}
