import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addListMembersRequestSchema,
  addListMembersResponseSchema,
  contactListSchema,
  contactListsResponseSchema,
  createListRequestSchema,
  listIdParamsSchema,
  listMemberParamsSchema,
  listMembersQuerySchema,
  listMembersResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createListsService } from '../services/lists.service';

/** Registers /api/v1/lists (the static contact lists: list them, make one) and /lists/{id}/members (read a list's people, add people), /lists/{id}/members/{contactId} (take one out) and /lists/{id} (delete). */
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

  // For any signed-in, verified person. Takes one person out of the list; the contact is not touched.
  typedApp.delete(
    '/lists/:id/members/:contactId',
    { config: { access: 'staff' }, schema: { params: listMemberParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await listsService.removeMember(request.principal, request.params.id, request.params.contactId);
      return reply.code(204).send(null);
    },
  );

  // For managers only (the guard answers 403 to staff). Deletes the list for good; its people stay as contacts.
  typedApp.delete(
    '/lists/:id',
    { config: { access: 'manager' }, schema: { params: listIdParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await listsService.deleteList(request.principal, request.params.id);
      return reply.code(204).send(null);
    },
  );
}
