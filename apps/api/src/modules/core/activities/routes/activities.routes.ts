import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  activitiesListResponseSchema,
  activitySchema,
  createNoteRequestSchema,
  listActivitiesQuerySchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createActivitiesService } from '../services/activities.service';

/** Registers /api/v1/notes (add a note) and /api/v1/activities (a lead's or a person's timeline). More routes arrive with the later slices. */
export function activitiesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const activitiesService = createActivitiesService({ database: app.kernel.database });

  // For any signed-in, verified person. The business and the writer come from the session, never from the request.
  typedApp.post(
    '/notes',
    { config: { access: 'staff' }, schema: { body: createNoteRequestSchema, response: { 201: activitySchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const note = await activitiesService.createNote(request.principal, request.body);
      return reply.code(201).send(note);
    },
  );

  // For any signed-in, verified person. A plain read: one lead's timeline or one person's.
  typedApp.get(
    '/activities',
    {
      config: { access: 'staff' },
      schema: { querystring: listActivitiesQuerySchema, response: { 200: activitiesListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return activitiesService.listActivities(request.principal, request.query);
    },
  );
}
