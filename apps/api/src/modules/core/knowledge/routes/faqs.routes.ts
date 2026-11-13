import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createFaqRequestSchema,
  faqIdParamsSchema,
  faqSchema,
  faqsResponseSchema,
  listFaqsQuerySchema,
  updateFaqRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createFaqsService } from '../services/faqs.service';

/** Registers /api/v1/knowledge/faqs (add, list) and /knowledge/faqs/{id} (change, remove). */
export function faqsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const faqsService = createFaqsService({ database: app.kernel.database });

  // For any signed-in, verified person (owner decision, 13 Nov 2026: anyone on the team may add an FAQ). The business comes from
  // the session, never from the request.
  typedApp.post(
    '/knowledge/faqs',
    {
      config: { access: 'staff' },
      schema: { body: createFaqRequestSchema, response: { 201: faqSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const faq = await faqsService.createFaq(request.principal, request.body);
      return reply.code(201).send(faq);
    },
  );

  // For any signed-in, verified person: staff need the list to answer customers. A plain read.
  typedApp.get(
    '/knowledge/faqs',
    {
      config: { access: 'staff' },
      schema: { querystring: listFaqsQuerySchema, response: { 200: faqsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return faqsService.listFaqs(request.principal, request.query);
    },
  );

  // For any signed-in, verified person. Only the fields sent change; another business's FAQ answers 404.
  typedApp.patch(
    '/knowledge/faqs/:id',
    {
      config: { access: 'staff' },
      schema: { params: faqIdParamsSchema, body: updateFaqRequestSchema, response: { 200: faqSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return faqsService.updateFaq(request.principal, request.params.id, request.body);
    },
  );

  // For any signed-in, verified person. A soft delete: the FAQ disappears from the list, its row is kept.
  typedApp.delete(
    '/knowledge/faqs/:id',
    { config: { access: 'staff' }, schema: { params: faqIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await faqsService.deleteFaq(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
