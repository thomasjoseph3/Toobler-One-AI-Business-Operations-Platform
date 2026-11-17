import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prefillRunIdParamsSchema, prefillRunSchema, startPrefillRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createPrefillService } from '../services/prefill.service';

/** Registers /api/v1/knowledge/prefill (start reading a website or Google listing) and /knowledge/prefill/{id} (how it is going). */
export function prefillRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const prefillService = createPrefillService({
    database: app.kernel.database,
    enqueueJob: (jobName, data) => app.kernel.enqueueJob(jobName, data),
    isGoogleListingSwitchedOn: app.kernel.config.googlePlaces.apiKey !== null,
  });

  // For managers only (the guard answers 403 to staff). Answers 202: the reading goes on in the background.
  typedApp.post(
    '/knowledge/prefill',
    {
      config: { access: 'manager' },
      schema: { body: startPrefillRequestSchema, response: { 202: prefillRunSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const run = await prefillService.startPrefill(request.principal, request.body);
      return reply.code(202).send(run);
    },
  );

  // For managers only. Another business's reading answers 404.
  typedApp.get(
    '/knowledge/prefill/:id',
    {
      config: { access: 'manager' },
      schema: { params: prefillRunIdParamsSchema, response: { 200: prefillRunSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return prefillService.getPrefill(request.principal, request.params.id);
    },
  );
}
