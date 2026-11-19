import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createFieldRequestSchema,
  fieldIdParamsSchema,
  updateFieldRequestSchema,
  fieldDefinitionSchema,
  fieldsListResponseSchema,
  listFieldsQuerySchema,
  reorderFieldsRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createFieldsService } from '../services/fields.service';

/** Registers GET and POST /api/v1/fields (list, add) and PATCH and DELETE /api/v1/fields/{id} (change, remove). */
export function fieldsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const fieldsService = createFieldsService({ database: app.kernel.database });

  // For any signed-in, verified person: staff need the definitions to fill in forms. A plain read.
  typedApp.get(
    '/fields',
    {
      config: { access: 'staff' },
      schema: { querystring: listFieldsQuerySchema, response: { 200: fieldsListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return fieldsService.listFields(request.principal, request.query);
    },
  );

  // Managers only (API.md). The business comes from the session, never from the request.
  typedApp.post(
    '/fields',
    {
      config: { access: 'manager' },
      schema: { body: createFieldRequestSchema, response: { 201: fieldDefinitionSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const field = await fieldsService.createField(request.principal, request.body);
      return reply.code(201).send(field);
    },
  );

  // Managers only: the fields of one object in a new order (every live field, once each).
  typedApp.post(
    '/fields/reorder',
    {
      config: { access: 'manager' },
      schema: { body: reorderFieldsRequestSchema, response: { 200: fieldsListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return fieldsService.reorderFields(request.principal, request.body);
    },
  );

  // Managers only. The key, type and object never change.
  typedApp.patch(
    '/fields/:id',
    {
      config: { access: 'manager' },
      schema: { params: fieldIdParamsSchema, body: updateFieldRequestSchema, response: { 200: fieldDefinitionSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return fieldsService.updateField(request.principal, request.params.id, request.body);
    },
  );

  // Managers only. Removing archives: the values are kept hidden for 30 days and the key stays taken.
  typedApp.delete(
    '/fields/:id',
    { config: { access: 'manager' }, schema: { params: fieldIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await fieldsService.deleteField(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
