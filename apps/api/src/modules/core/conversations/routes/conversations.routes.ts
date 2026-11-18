import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  conversationDetailSchema,
  conversationIdParamsSchema,
  filteredConversationsResponseSchema,
  listFilteredConversationsQuerySchema,
  setConversationTypeRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createConversationCorrectionService } from '../services/conversation-correction.service';
import { createFilteredConversationsService } from '../services/filtered-conversations.service';
import { createConversationReaderService } from '../services/conversation-reader.service';

/** Registers /api/v1/conversations/{id} (read one) and /conversations/{id}/type (a person changes its type). */
export function conversationsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const readerService = createConversationReaderService({ database: app.kernel.database });
  const correctionService = createConversationCorrectionService({ database: app.kernel.database });
  const filteredService = createFilteredConversationsService({ database: app.kernel.database });

  // For managers and staff (the "own leads only" role answers 403). The Filtered tab: spam, wrong numbers and silent calls, newest first.
  typedApp.get(
    '/conversations',
    {
      config: { access: 'staff' },
      schema: {
        querystring: listFilteredConversationsQuerySchema,
        response: { 200: filteredConversationsResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return filteredService.listFilteredConversations(request.principal, request.query);
    },
  );

  // For managers and staff (the "own leads only" role answers 403: a conversation has no owner yet). Another business's conversation and an
  // unknown id both answer 404.
  typedApp.get(
    '/conversations/:id',
    {
      config: { access: 'staff' },
      schema: { params: conversationIdParamsSchema, response: { 200: conversationDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return readerService.getConversation(request.principal, request.params.id);
    },
  );

  // For managers and staff. Sets the type to one of the business's switched-on types; the router runs again and what the conversation led to
  // follows. Answers with the conversation as it is now.
  typedApp.post(
    '/conversations/:id/type',
    {
      config: { access: 'staff' },
      schema: {
        params: conversationIdParamsSchema,
        body: setConversationTypeRequestSchema,
        response: { 200: conversationDetailSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return correctionService.setConversationType(request.principal, request.params.id, request.body);
    },
  );

  // For managers and staff. Puts a filtered conversation back onto the board: it becomes an enquiry, and its contact and lead are made.
  typedApp.post(
    '/conversations/:id/unfilter',
    {
      config: { access: 'staff' },
      schema: { params: conversationIdParamsSchema, response: { 200: conversationDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return filteredService.unfilterConversation(request.principal, request.params.id);
    },
  );
}
