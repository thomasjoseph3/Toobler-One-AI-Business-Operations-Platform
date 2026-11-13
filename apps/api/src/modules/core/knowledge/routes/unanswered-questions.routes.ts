import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listUnansweredQuestionsQuerySchema, unansweredQuestionsResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createUnansweredQuestionsService } from '../services/unanswered-questions.service';

/** Registers /api/v1/knowledge/unanswered (list). Answering and ignoring arrive with the next slice. */
export function unansweredQuestionsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const unansweredQuestionsService = createUnansweredQuestionsService({ database: app.kernel.database });

  // For any signed-in, verified person (owner decision, 13 Nov 2026). A plain read; the business comes from the session.
  typedApp.get(
    '/knowledge/unanswered',
    {
      config: { access: 'staff' },
      schema: { querystring: listUnansweredQuestionsQuerySchema, response: { 200: unansweredQuestionsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return unansweredQuestionsService.listUnansweredQuestions(request.principal, request.query);
    },
  );
}
