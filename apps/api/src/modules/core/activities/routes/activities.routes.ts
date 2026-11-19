import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  activitiesListResponseSchema,
  activitySchema,
  createNoteRequestSchema,
  listActivitiesQuerySchema,
  noteCountsQuerySchema,
  noteCountsResponseSchema,
  noteIdParamsSchema,
  updateNoteRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createActivitiesService } from '../services/activities.service';

/** Registers /api/v1/notes (add a note), /notes/{id} (change your own note, delete a note) and /api/v1/activities (a lead's or a person's timeline). */
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

  // For any signed-in, verified person, but only the writer of the note may change it (the service answers 403 to anyone else).
  typedApp.patch(
    '/notes/:id',
    {
      config: { access: 'staff' },
      schema: { params: noteIdParamsSchema, body: updateNoteRequestSchema, response: { 200: activitySchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return activitiesService.updateNote(request.principal, request.params.id, request.body);
    },
  );

  // For managers only (the guard answers 403 to staff). A soft delete: the note disappears, its row is kept.
  typedApp.delete(
    '/notes/:id',
    { config: { access: 'manager' }, schema: { params: noteIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await activitiesService.deleteNote(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );

  // For any signed-in, verified person. A plain read: how many notes each of the asked-about leads has (`/activities/counts` is its own
  // address, so it is never mistaken for an id).
  typedApp.get(
    '/activities/counts',
    {
      config: { access: 'staff' },
      schema: { querystring: noteCountsQuerySchema, response: { 200: noteCountsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return activitiesService.getNoteCounts(request.principal, request.query.lead_ids);
    },
  );
}
