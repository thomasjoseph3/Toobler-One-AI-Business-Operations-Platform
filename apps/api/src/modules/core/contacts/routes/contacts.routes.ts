import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  contactIdParamsSchema,
  contactSchema,
  contactsListResponseSchema,
  createContactRequestSchema,
  listContactsQuerySchema,
  updateContactRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createContactsService } from '../services/contacts.service';

/** Registers /api/v1/contacts (add, list) and /api/v1/contacts/{id} (read one, change one). */
export function contactsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const contactsService = createContactsService({ database: app.kernel.database });

  // For any signed-in, verified person: staff add contacts. The business comes from the session, never from the request.
  typedApp.post(
    '/contacts',
    { config: { access: 'staff' }, schema: { body: createContactRequestSchema, response: { 201: contactSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const contact = await contactsService.createContact(request.principal, request.body);
      return reply.code(201).send(contact);
    },
  );

  // For any signed-in, verified person. A plain read.
  typedApp.get(
    '/contacts',
    {
      config: { access: 'staff' },
      schema: { querystring: listContactsQuerySchema, response: { 200: contactsListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return contactsService.listContacts(request.principal, request.query);
    },
  );

  // For any signed-in, verified person. Another business's contact, a deleted one and an unknown id all answer 404.
  typedApp.get(
    '/contacts/:id',
    { config: { access: 'staff' }, schema: { params: contactIdParamsSchema, response: { 200: contactSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return contactsService.getContact(request.principal, request.params.id);
    },
  );

  // For any signed-in, verified person. Only the fields sent change; the body may not name anything else.
  typedApp.patch(
    '/contacts/:id',
    {
      config: { access: 'staff' },
      schema: { params: contactIdParamsSchema, body: updateContactRequestSchema, response: { 200: contactSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return contactsService.updateContact(request.principal, request.params.id, request.body);
    },
  );
}
