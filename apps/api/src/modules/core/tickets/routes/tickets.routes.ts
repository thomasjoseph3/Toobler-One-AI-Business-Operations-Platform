import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  ticketDetailSchema,
  ticketIdParamsSchema,
  ticketsListResponseSchema,
  updateTicketRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTicketsService } from '../services/tickets.service';

/** Registers /api/v1/tickets (add, list) and /tickets/{id} (read one, change one). More routes arrive with the later slices. */
export function ticketsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const ticketsService = createTicketsService({ database: app.kernel.database });

  // For any signed-in, verified person. The business comes from the session, never from the request.
  typedApp.post(
    '/tickets',
    { config: { access: 'staff' }, schema: { body: createTicketRequestSchema, response: { 201: ticketDetailSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const ticket = await ticketsService.createTicket(request.principal, request.body);
      return reply.code(201).send(ticket);
    },
  );

  // For any signed-in, verified person, whatever their role (tickets are shared work). A plain read with filters.
  typedApp.get(
    '/tickets',
    {
      config: { access: 'staff' },
      schema: { querystring: listTicketsQuerySchema, response: { 200: ticketsListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return ticketsService.listTickets(request.principal, request.query);
    },
  );

  // For any signed-in, verified person, whatever their role (tickets are shared work). Another business's ticket and an
  // unknown id both answer 404.
  typedApp.get(
    '/tickets/:id',
    { config: { access: 'staff' }, schema: { params: ticketIdParamsSchema, response: { 200: ticketDetailSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return ticketsService.getTicket(request.principal, request.params.id);
    },
  );

  // For any signed-in, verified person, whatever their role. Only the fields sent change; the body may not name the status,
  // the contact or anything else. A closed ticket answers 409.
  typedApp.patch(
    '/tickets/:id',
    {
      config: { access: 'staff' },
      schema: { params: ticketIdParamsSchema, body: updateTicketRequestSchema, response: { 200: ticketDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return ticketsService.updateTicket(request.principal, request.params.id, request.body);
    },
  );
}
