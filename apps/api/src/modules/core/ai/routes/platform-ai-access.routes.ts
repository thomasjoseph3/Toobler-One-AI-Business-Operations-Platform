import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { platformAiAccessSchema, platformBusinessParamsSchema, updateAiAccessRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createPlatformAiAccessService } from '../services/platform-ai-access.service';

/** Registers GET and PUT /api/v1/platform/businesses/{id}/ai-access (the Toobler team decides who may use the platform's AI keys). */
export function platformAiAccessRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const platformAiAccessService = createPlatformAiAccessService({ database: app.kernel.database });

  // Platform admins only (a flag on the person, set in the database): the guard answers 403 to everyone else, even to the
  // business itself, and 401 to anyone not signed in. The business comes from the address because a platform admin works across businesses.
  typedApp.get(
    '/platform/businesses/:id/ai-access',
    {
      config: { access: 'platform' },
      schema: { params: platformBusinessParamsSchema, response: { 200: platformAiAccessSchema } },
    },
    async (request) => platformAiAccessService.getAccess(request.params.id),
  );

  typedApp.put(
    '/platform/businesses/:id/ai-access',
    {
      config: { access: 'platform' },
      schema: {
        params: platformBusinessParamsSchema,
        body: updateAiAccessRequestSchema,
        response: { 200: platformAiAccessSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return platformAiAccessService.updateAccess(request.principal, request.params.id, request.body);
    },
  );
}
