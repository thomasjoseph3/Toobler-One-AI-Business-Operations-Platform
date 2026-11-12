import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  putSituationRequestSchema,
  situationKeyParamsSchema,
  situationSchema,
  situationsResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createSituationsService } from '../services/situations.service';

/** Registers /api/v1/knowledge/situations (read the seven) and /knowledge/situations/{key} (choose how one is handled). */
export function situationsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const situationsService = createSituationsService({ database: app.kernel.database });

  // For any signed-in, verified person: staff can read how the business handles things. The business comes from the session.
  typedApp.get(
    '/knowledge/situations',
    { config: { access: 'staff' }, schema: { response: { 200: situationsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return situationsService.listSituations(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The key is a code from the list of seven, not a business record.
  typedApp.put(
    '/knowledge/situations/:key',
    {
      config: { access: 'manager' },
      schema: { params: situationKeyParamsSchema, body: putSituationRequestSchema, response: { 200: situationSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return situationsService.chooseHandling(request.principal, request.params.key, request.body);
    },
  );
}
