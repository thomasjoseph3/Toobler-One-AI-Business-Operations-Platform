import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  addListMembersRequestSchema,
  addListMembersResponseSchema,
  contactListSchema,
  contactListsResponseSchema,
  createListRequestSchema,
  listIdParamsSchema,
  listMembersQuerySchema,
  listMembersResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createListsService } from '../services/lists.service';

/** Registers /api/v1/lists (the static contact lists: list them, make one) and /lists/{id}/members (read a list's people, add people). */
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

  // For any signed-in, verified person: a plain read of one list's people, a page at a time. Another business's list is 404.
  typedApp.get(
    '/lists/:id/members',
    {
      config: { access: 'staff' },
      schema: {
        params: listIdParamsSchema,
        querystring: listMembersQuerySchema,
        response: { 200: listMembersResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return listsService.listMembers(request.principal, request.params.id, request.query);
    },
  );

  // For any signed-in, verified person. Puts contacts in a list; ones already in it are left as they are.
  typedApp.post(
    '/lists/:id/members',
    {
      config: { access: 'staff' },
      schema: {
        params: listIdParamsSchema,
        body: addListMembersRequestSchema,
        response: { 200: addListMembersResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return listsService.addMembers(request.principal, request.params.id, request.body);
    },
  );
}
