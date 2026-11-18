import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createFieldRequestSchema,
  fieldDefinitionSchema,
  fieldsListResponseSchema,
  listFieldsQuerySchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createFieldsService } from '../services/fields.service';

/** Registers GET /api/v1/fields (the business's custom fields) and POST /api/v1/fields (add one). */
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
}
