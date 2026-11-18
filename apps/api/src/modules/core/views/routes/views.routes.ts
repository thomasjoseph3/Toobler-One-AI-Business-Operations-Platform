import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createViewRequestSchema,
  listViewsQuerySchema,
  savedViewSchema,
  viewsListResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createViewsService } from '../services/views.service';

/** Registers /api/v1/views (list the views of a list, save one). */
export function viewsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const viewsService = createViewsService({ database: app.kernel.database });

  // For any signed-in, verified person: their own views of a list and the ones a manager shared.
  typedApp.get(
    '/views',
    {
      config: { access: 'staff' },
      schema: { querystring: listViewsQuerySchema, response: { 200: viewsListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return viewsService.listViews(request.principal, request.query);
    },
  );

  // For any signed-in, verified person. Saves the list as it is on screen; the view is the person's own. The owner and the business come from the session.
  typedApp.post(
    '/views',
    {
      config: { access: 'staff' },
      schema: { body: createViewRequestSchema, response: { 201: savedViewSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const view = await viewsService.createView(request.principal, request.body);
      return reply.code(201).send(view);
    },
  );
}
