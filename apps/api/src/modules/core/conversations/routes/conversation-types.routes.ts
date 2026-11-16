import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  conversationTypeIdParamsSchema,
  conversationTypeSchema,
  conversationTypesListResponseSchema,
  createConversationTypeRequestSchema,
  tryConversationTypeRequestSchema,
  tryConversationTypeResponseSchema,
  reorderConversationTypesRequestSchema,
  updateConversationTypeRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createAiService } from '../../ai';
import { createConversationClassifier } from '../services/conversation-classifier.service';
import { createConversationTypeTrialService } from '../services/conversation-type-trial.service';
import { createConversationTypeChangesService } from '../services/conversation-type-changes.service';
import { createConversationTypesService } from '../services/conversation-types.service';

/** Registers /api/v1/conversation-types (list, add), /conversation-types/test (Try it), /conversation-types/reorder, /conversation-types/{id} (change, remove). More routes arrive with the later slices. */
export function conversationTypesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const conversationTypesService = createConversationTypesService({ database: app.kernel.database });
  const changesService = createConversationTypeChangesService({ database: app.kernel.database });
  // "Try it" asks the AI through the AI module's service (the job and the business's settings pick the model, never this module)
  const trialService = createConversationTypeTrialService({
    database: app.kernel.database,
    classifier: createConversationClassifier({
      aiService: createAiService({ database: app.kernel.database, config: app.kernel.config, llm: app.kernel.llm }),
    }),
  });

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

  // Managers only, and limited to 10 a minute: each "Try it" is a real AI call that costs a little. Saves nothing. A static address,
  // so "test" is never read as an id.
  typedApp.post(
    '/conversation-types/test',
    {
      config: { access: 'manager', ...routeLimit(app, 'tryConversationType') },
      schema: { body: tryConversationTypeRequestSchema, response: { 200: tryConversationTypeResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return trialService.tryConversationText(request.principal, request.body);
    },
  );

  // Managers only. Lists every type of the business exactly once, in the order wanted. A static address, so "reorder" is never read as an id.
  typedApp.post(
    '/conversation-types/reorder',
    {
      config: { access: 'manager' },
      schema: { body: reorderConversationTypesRequestSchema, response: { 200: conversationTypesListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return changesService.reorderConversationTypes(request.principal, request.body);
    },
  );

  // Managers only. Only the fields sent change. The built-in types can be renamed and re-routed but not switched off.
  typedApp.patch(
    '/conversation-types/:id',
    {
      config: { access: 'manager' },
      schema: {
        params: conversationTypeIdParamsSchema,
        body: updateConversationTypeRequestSchema,
        response: { 200: conversationTypeSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return changesService.updateConversationType(request.principal, request.params.id, request.body);
    },
  );

  // Managers only. A custom type only: the built-in types answer 409. (The screen asks "Are you sure?" first.)
  typedApp.delete(
    '/conversation-types/:id',
    { config: { access: 'manager' }, schema: { params: conversationTypeIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await conversationTypesService.deleteConversationType(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
