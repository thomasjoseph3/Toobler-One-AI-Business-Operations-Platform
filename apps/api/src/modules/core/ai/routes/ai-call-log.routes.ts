import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiCallsQuerySchema, aiCallsResponseSchema, platformAiKeysResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createAiCallLogService } from '../services/ai-call-log.service';
import { createPlatformAiKeysService } from '../services/platform-ai-keys.service';

/** Registers GET /api/v1/ai/calls (the business's call log) and GET /api/v1/platform/ai/keys (the health of the platform's own keys). */
export function aiCallLogRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const aiCallLogService = createAiCallLogService({ database: app.kernel.database });
  const platformAiKeysService = createPlatformAiKeysService({
    database: app.kernel.database,
    config: app.kernel.config,
  });

  // For managers only. The latest AI calls of the business, newest first, with who answered, any fallback and the tokens used.
  // No message text and no key is in the log. The business comes from the session.
  typedApp.get(
    '/ai/calls',
    {
      config: { access: 'manager' },
      schema: { querystring: aiCallsQuerySchema, response: { 200: aiCallsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return aiCallLogService.listCalls(request.principal, request.query);
    },
  );

  // Platform admins only. Each of the platform's own keys by its place in the server's list (never the key) with what the last
  // daily check found. Not tied to any business.
  typedApp.get(
    '/platform/ai/keys',
    { config: { access: 'platform' }, schema: { response: { 200: platformAiKeysResponseSchema } } },
    async () => platformAiKeysService.listKeys(),
  );
}
