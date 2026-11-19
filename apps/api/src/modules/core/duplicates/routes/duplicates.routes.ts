import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  dismissDuplicateResponseSchema,
  duplicateIdParamsSchema,
  duplicatesListResponseSchema,
  listDuplicatesQuerySchema,
  mergeDuplicateRequestSchema,
  mergeDuplicateResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createDuplicatesService } from '../services/duplicates.service';

/** Registers /api/v1/duplicates (the open pairs), /duplicates/{id}/merge (managers) and /duplicates/{id}/dismiss ("Not the same"). */
export function duplicatesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const duplicatesService = createDuplicatesService({ database: app.kernel.database });

  // For any signed-in, verified person (API.md: Staff). A plain read; the business comes from the session.
  typedApp.get(
    '/duplicates',
    {
      config: { access: 'staff' },
      schema: { querystring: listDuplicatesQuerySchema, response: { 200: duplicatesListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return duplicatesService.listDuplicates(request.principal, request.query.object);
    },
  );

  // Managers only: a merge can not be undone.
  typedApp.post(
    '/duplicates/:id/merge',
    {
      config: { access: 'manager' },
      schema: {
        params: duplicateIdParamsSchema,
        body: mergeDuplicateRequestSchema,
        response: { 200: mergeDuplicateResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return duplicatesService.mergeDuplicate(request.principal, request.params.id, request.body);
    },
  );

  // For any signed-in, verified person (API.md: Staff).
  typedApp.post(
    '/duplicates/:id/dismiss',
    {
      config: { access: 'staff' },
      schema: { params: duplicateIdParamsSchema, response: { 200: dismissDuplicateResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return duplicatesService.dismissDuplicate(request.principal, request.params.id);
    },
  );
}
