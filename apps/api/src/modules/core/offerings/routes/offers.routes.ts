import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createOfferRequestSchema, offerSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createOffersService } from '../services/offers.service';

/** Registers /api/v1/offers (add). More routes arrive with the later slices. */
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
}
