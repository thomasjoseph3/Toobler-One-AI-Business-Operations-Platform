import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { modulesResponseSchema, platformBusinessParamsSchema, setEntitlementRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createPlatformModulesService } from '../services/platform-modules.service';

/** Registers POST /api/v1/platform/businesses/{id}/modules (the Toobler team puts a module in a business's plan, or takes it out). */
export function platformModulesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const platformModulesService = createPlatformModulesService({
    database: app.kernel.database,
    moduleGate: app.kernel.gate,
  });

  // Platform admins only (a flag on the person, set in the database): the guard answers 403 to everyone else and 401 to
  // anyone not signed in. The business comes from the address because a platform admin works across businesses.
  typedApp.post(
    '/platform/businesses/:id/modules',
    {
      config: { access: 'platform' },
      schema: {
        params: platformBusinessParamsSchema,
        body: setEntitlementRequestSchema,
        response: { 200: modulesResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return platformModulesService.setEntitlement(
        request.principal,
        request.params.id,
        request.body.moduleId,
        request.body.entitled,
      );
    },
  );
}
