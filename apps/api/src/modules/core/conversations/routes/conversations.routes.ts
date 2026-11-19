import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  conversationDetailSchema,
  conversationIdParamsSchema,
  conversationMessageSchema,
  filteredConversationsResponseSchema,
  inboxResponseSchema,
  listFilteredConversationsQuerySchema,
  listInboxQuerySchema,
  replyToConversationRequestSchema,
  setConversationTypeRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createConversationCorrectionService } from '../services/conversation-correction.service';
import { createFilteredConversationsService } from '../services/filtered-conversations.service';
import { createConversationInboxService } from '../services/conversation-inbox.service';
import { createConversationReaderService } from '../services/conversation-reader.service';
import { createConversationTakeoverService } from '../services/conversation-takeover.service';

/** Registers /api/v1/conversations/{id} (read one) and /conversations/{id}/type (a person changes its type). */
export function conversationsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const readerService = createConversationReaderService({ database: app.kernel.database });
  const correctionService = createConversationCorrectionService({ database: app.kernel.database });
  const filteredService = createFilteredConversationsService({ database: app.kernel.database });
  const inboxService = createConversationInboxService({ database: app.kernel.database });
  const takeoverService = createConversationTakeoverService({ database: app.kernel.database });

  // For managers and staff (the "own leads only" role answers 403). `filtered=true` is the Filtered tab (spam, wrong numbers, silent calls, newest
  // first); without it, this is the inbox (every real conversation, needs a person first, then newest activity).
  typedApp.get(
    '/conversations',
    {
      config: { access: 'staff' },
      schema: {
        querystring: z.union([listFilteredConversationsQuerySchema, listInboxQuerySchema]),
        response: { 200: z.union([filteredConversationsResponseSchema, inboxResponseSchema]) },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      if ('filtered' in request.query)
        return filteredService.listFilteredConversations(request.principal, request.query);
      return inboxService.listInbox(request.principal, request.query);
    },
  );

  // For managers and staff. "I'll handle this": the AI stops replying and the person replies from the inbox. 409 when someone else holds it.
  typedApp.post(
    '/conversations/:id/takeover',
    {
      config: { access: 'staff' },
      schema: { params: conversationIdParamsSchema, response: { 200: conversationDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return takeoverService.takeOver(request.principal, request.params.id);
    },
  );

  // For managers and staff. "Hand back to AI": the holder (or a manager) lets the AI answer again.
  typedApp.post(
    '/conversations/:id/handback',
    {
      config: { access: 'staff' },
      schema: { params: conversationIdParamsSchema, response: { 200: conversationDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return takeoverService.handBack(request.principal, request.params.id);
    },
  );

  // For managers and staff. The holder's reply, sent on the customer's channel.
  typedApp.post(
    '/conversations/:id/reply',
    {
      config: { access: 'staff' },
      schema: {
        params: conversationIdParamsSchema,
        body: replyToConversationRequestSchema,
        response: { 201: conversationMessageSchema },
      },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const message = await takeoverService.reply(request.principal, request.params.id, request.body.body);
      return reply.code(201).send(message);
    },
  );

  // For managers and staff. Marks the conversation done; a new customer message reopens it.
  typedApp.post(
    '/conversations/:id/done',
    {
      config: { access: 'staff' },
      schema: { params: conversationIdParamsSchema, response: { 200: conversationDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return takeoverService.markDone(request.principal, request.params.id);
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
