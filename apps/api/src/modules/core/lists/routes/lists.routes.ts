import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { contactListSchema, contactListsResponseSchema, createListRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createListsService } from '../services/lists.service';

/** Registers /api/v1/lists (the static contact lists: list them, make one). */
export function listsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const listsService = createListsService({ database: app.kernel.database });

  // For any signed-in, verified person: a plain read.
  typedApp.get(
    '/lists',
    { config: { access: 'staff' }, schema: { response: { 200: contactListsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return listsService.listLists(request.principal);
    },
  );

  // For any signed-in, verified person. Makes a list from contacts picked by hand or from a contacts view. The business and who made it come from the session.
  typedApp.post(
    '/lists',
    { config: { access: 'staff' }, schema: { body: createListRequestSchema, response: { 201: contactListSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const list = await listsService.createList(request.principal, request.body);
      return reply.code(201).send(list);
    },
  );
}
