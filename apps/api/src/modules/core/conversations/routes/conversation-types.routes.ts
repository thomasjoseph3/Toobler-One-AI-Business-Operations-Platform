import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  conversationTypeSchema,
  conversationTypesListResponseSchema,
  createConversationTypeRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createConversationTypesService } from '../services/conversation-types.service';

/** Registers /api/v1/conversation-types (list, add). More routes arrive with the later slices. */
export function conversationTypesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const conversationTypesService = createConversationTypesService({ database: app.kernel.database });

  // For any signed-in, verified person: staff see how conversations are sorted. The business comes from the session.
  typedApp.get(
    '/conversation-types',
    { config: { access: 'staff' }, schema: { response: { 200: conversationTypesListResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return conversationTypesService.listConversationTypes(request.principal);
    },
  );

  // Managers only: what happens to a kind of conversation is the business's decision.
  typedApp.post(
    '/conversation-types',
    {
      config: { access: 'manager' },
      schema: { body: createConversationTypeRequestSchema, response: { 201: conversationTypeSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const created = await conversationTypesService.createConversationType(request.principal, request.body);
      return reply.code(201).send(created);
    },
  );
}
