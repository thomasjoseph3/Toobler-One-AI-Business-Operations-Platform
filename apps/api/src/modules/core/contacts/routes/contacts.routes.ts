import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  contactSchema,
  contactsListResponseSchema,
  createContactRequestSchema,
  listContactsQuerySchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createContactsService } from '../services/contacts.service';

/** Registers POST /api/v1/contacts (add a contact) and GET /api/v1/contacts (search and page through them). */
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
}
