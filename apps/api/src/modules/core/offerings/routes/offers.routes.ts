import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createOfferRequestSchema,
  listOffersQuerySchema,
  offerIdParamsSchema,
  offerSchema,
  offersResponseSchema,
  updateOfferRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createOffersService } from '../services/offers.service';

/** Registers /api/v1/offers (add, list) and /offers/{id} (change, remove). More routes arrive with the later slices. */
export function offersRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const offersService = createOffersService({ database: app.kernel.database });

  // For managers only (the guard answers 403 to staff). The business and its time zone come from the session, never from the request.
  typedApp.post(
    '/offers',
    { config: { access: 'manager' }, schema: { body: createOfferRequestSchema, response: { 201: offerSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const offer = await offersService.createOffer(request.principal, request.body);
      return reply.code(201).send(offer);
    },
  );

  // For any signed-in, verified person: staff need to know what is on. The default shows only the offers still on today.
  typedApp.get(
    '/offers',
    {
      config: { access: 'staff' },
      schema: { querystring: listOffersQuerySchema, response: { 200: offersResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return offersService.listOffers(request.principal, request.query);
    },
  );

  // For managers only. Only the fields sent change; another business's offer answers 404.
  typedApp.patch(
    '/offers/:id',
    {
      config: { access: 'manager' },
      schema: { params: offerIdParamsSchema, body: updateOfferRequestSchema, response: { 200: offerSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return offersService.updateOffer(request.principal, request.params.id, request.body);
    },
  );

  // For managers only. A soft delete: the offer disappears from every list, its row is kept.
  typedApp.delete(
    '/offers/:id',
    { config: { access: 'manager' }, schema: { params: offerIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await offersService.deleteOffer(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
