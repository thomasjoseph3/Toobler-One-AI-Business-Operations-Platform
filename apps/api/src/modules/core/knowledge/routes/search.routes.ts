import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { searchKnowledgeQuerySchema, searchResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createKnowledgeSearchService } from '../services/knowledge-search.service';

/** Registers /api/v1/knowledge/search. */
export function searchRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const knowledgeSearchService = createKnowledgeSearchService({ database: app.kernel.database });

  // For any signed-in, verified person: try a customer's question and see what the AI would find. A plain read; the business comes
  // from the session.
  typedApp.get(
    '/knowledge/search',
    {
      config: { access: 'staff' },
      schema: { querystring: searchKnowledgeQuerySchema, response: { 200: searchResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return knowledgeSearchService.searchKnowledge(request.principal.accountId, request.query.q, request.query.limit);
    },
  );
}
