import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  applyPresetResponseSchema,
  goLiveResponseSchema,
  patchSetupRequestSchema,
  setupChatRequestSchema,
  setupChatResponseSchema,
  setupResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createAiService } from '../../ai';
import { createKnowledgeService } from '../../knowledge';
import { createSetupChatService } from '../services/setup-chat.service';
import { createSetupService } from '../services/setup.service';

/**
 * Registers /api/v1/setup: read the wizard's steps (GET) and mark one step done or skipped (PATCH), plus /setup/apply-preset (the industry's
 * words for the pipeline) and /setup/go-live (start answering real customers).
 */
export function setupRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const setupService = createSetupService({ database: app.kernel.database });
  const setupChatService = createSetupChatService({
    knowledgeService: createKnowledgeService({ database: app.kernel.database }),
    aiService: createAiService({ database: app.kernel.database, config: app.kernel.config, llm: app.kernel.llm }),
  });

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.get(
    '/setup',
    { config: { access: 'manager' }, schema: { response: { 200: setupResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return setupService.getSetup(request.principal);
    },
  );

  // For managers only. Only the step sent changes; a step the system checks itself answers 400.
  typedApp.patch(
    '/setup',
    {
      config: { access: 'manager' },
      schema: { body: patchSetupRequestSchema, response: { 200: setupResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return setupService.markStep(request.principal, request.body);
    },
  );

  // For managers only. Takes nothing: the industry comes from the business, never from the request.
  typedApp.post(
    '/setup/apply-preset',
    { config: { access: 'manager' }, schema: { response: { 200: applyPresetResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return setupService.applyPreset(request.principal);
    },
  );

  // For managers only. One owner message in, the next question out. The AI may read a pick or yes/no reply, so it is rate limited.
  typedApp.post(
    '/setup/chat',
    {
      config: { access: 'manager', ...routeLimit(app, 'setupChat') },
      schema: { body: setupChatRequestSchema, response: { 200: setupChatResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return setupChatService.reply(request.principal, request.body);
    },
  );

  // For managers only. 409 NOT_READY with the list of what is missing.
  typedApp.post(
    '/setup/go-live',
    { config: { access: 'manager' }, schema: { response: { 200: goLiveResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return setupService.goLive(request.principal);
    },
  );
}
