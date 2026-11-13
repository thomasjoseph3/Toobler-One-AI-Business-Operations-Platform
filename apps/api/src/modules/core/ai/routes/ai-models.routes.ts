import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiModelsResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { listAiModels } from '../services/ai-models.service';

/** Registers GET /api/v1/ai/models. More routes arrive with the later slices of F37. */
export function aiModelsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // For managers only (the guard answers 403 to staff). Shows the models and, for this business, which could answer today and in
  // what order. It never holds a key: only whether a key exists for each company.
  typedApp.get(
    '/ai/models',
    { config: { access: 'manager' }, schema: { response: { 200: aiModelsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return listAiModels(app.kernel.database, app.kernel.config, request.principal.accountId);
    },
  );
}
