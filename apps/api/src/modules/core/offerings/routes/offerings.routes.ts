import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createOfferingRequestSchema,
  listOfferingsQuerySchema,
  offeringIdParamsSchema,
  offeringSchema,
  offeringsResponseSchema,
  reorderOfferingsRequestSchema,
  updateOfferingRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createOfferingsService } from '../services/offerings.service';

/** Registers /api/v1/offerings (add, list), /offerings/reorder and /offerings/{id} (change, remove). More routes arrive with the later slices. */
export function offeringsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const offeringsService = createOfferingsService({ database: app.kernel.database });

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.post(
    '/offerings',
    {
      config: { access: 'manager' },
      schema: { body: createOfferingRequestSchema, response: { 201: offeringSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const offering = await offeringsService.createOffering(request.principal, request.body);
      return reply.code(201).send(offering);
    },
  );

  // For any signed-in, verified person: staff need the list to answer customers. A plain read.
  typedApp.get(
    '/offerings',
    {
      config: { access: 'staff' },
      schema: { querystring: listOfferingsQuerySchema, response: { 200: offeringsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return offeringsService.listOfferings(request.principal, request.query);
    },
  );

  // For managers only. Sends every offering's id once, in the new order. (Registered before /offerings/:id so "reorder" is never read as an id.)
  typedApp.post(
    '/offerings/reorder',
    {
      config: { access: 'manager' },
      schema: { body: reorderOfferingsRequestSchema, response: { 200: offeringsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return offeringsService.reorderOfferings(request.principal, request.body);
    },
  );

  // For managers only (the guard answers 403 to staff). Only the fields sent change; another business's offering answers 404.
  typedApp.patch(
    '/offerings/:id',
    {
      config: { access: 'manager' },
      schema: { params: offeringIdParamsSchema, body: updateOfferingRequestSchema, response: { 200: offeringSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return offeringsService.updateOffering(request.principal, request.params.id, request.body);
    },
  );

  // For managers only. A soft delete: the offering disappears from every list, its row is kept.
  typedApp.delete(
    '/offerings/:id',
    { config: { access: 'manager' }, schema: { params: offeringIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await offeringsService.deleteOffering(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
