import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createTicketRequestSchema, ticketDetailSchema, ticketIdParamsSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTicketsService } from '../services/tickets.service';

/** Registers /api/v1/tickets (add) and /tickets/{id} (read one). More routes arrive with the later slices. */
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
}
