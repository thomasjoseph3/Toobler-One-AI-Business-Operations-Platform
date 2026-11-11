import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { moduleIdParamsSchema, modulesResponseSchema, switchModuleRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createModulesService } from '../services/modules.service';

/** Registers GET /api/v1/modules (the business's modules) and PATCH /api/v1/modules/{id} (switch one on or off). */
export function modulesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const modulesService = createModulesService({ database: app.kernel.database, moduleGate: app.kernel.gate });

  // For anyone signed in: staff see what is on, so the menu and the Settings screen can show it. A plain read.
  typedApp.get(
    '/modules',
    { config: { access: 'staff' }, schema: { response: { 200: modulesResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return modulesService.listModules(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.patch(
    '/modules/:id',
    {
      config: { access: 'manager' },
      schema: {
        params: moduleIdParamsSchema,
        body: switchModuleRequestSchema,
        response: { 200: modulesResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return modulesService.switchModule(request.principal, request.params.id, request.body.enabled);
    },
  );
}
