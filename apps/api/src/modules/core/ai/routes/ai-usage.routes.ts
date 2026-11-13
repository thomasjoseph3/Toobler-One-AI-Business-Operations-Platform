import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiStatusResponseSchema, aiUsageQuerySchema, aiUsageResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createAiUsageService } from '../services/ai-usage.service';

/** Registers GET /api/v1/ai/usage and GET /api/v1/ai/status. */
export function aiUsageRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const aiUsageService = createAiUsageService({ database: app.kernel.database, config: app.kernel.config });

  // For managers only. What the business's AI used (calls, failures, fallbacks, tokens), as one total or split by job, agent,
  // channel, model or day, and the platform's keys against the cap. The business comes from the session.
  typedApp.get(
    '/ai/usage',
    {
      config: { access: 'manager' },
      schema: { querystring: aiUsageQuerySchema, response: { 200: aiUsageResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return aiUsageService.getUsage(request.principal, request.query);
    },
  );

  // For managers only. What is running right now for each job, whether it is on a fallback, and which keys are resting.
  typedApp.get(
    '/ai/status',
    { config: { access: 'manager' }, schema: { response: { 200: aiStatusResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return aiUsageService.getStatus(request.principal);
    },
  );
}
