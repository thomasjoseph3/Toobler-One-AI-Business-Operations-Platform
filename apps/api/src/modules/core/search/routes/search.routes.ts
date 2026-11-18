import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { globalSearchQuerySchema, globalGlobalSearchResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createSearchService } from '../services/search.service';

/** Registers /api/v1/search: the search box at the top of every page. */
export function searchRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const searchService = createSearchService({ database: app.kernel.database });

  // For any signed-in, verified person. Finds contacts, companies and leads (at most 5 of each); the "own leads only" role finds only its own leads.
  typedApp.get(
    '/search',
    {
      config: { access: 'staff' },
      schema: { querystring: globalSearchQuerySchema, response: { 200: globalGlobalSearchResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return searchService.search(request.principal, request.query.q);
    },
  );
}
