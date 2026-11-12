import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  knowledgeQuestionsResponseSchema,
  putAnswerRequestSchema,
  putAnswerResponseSchema,
  questionKeyParamsSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createKnowledgeService } from '../services/knowledge.service';

/** Registers /api/v1/knowledge/questions (read the questions and answers) and /knowledge/answers/{question_key} (answer one). */
export function knowledgeRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const knowledgeService = createKnowledgeService({ database: app.kernel.database });

  // For any signed-in, verified person: staff can read the profile. The business and its industry come from the session.
  typedApp.get(
    '/knowledge/questions',
    { config: { access: 'staff' }, schema: { response: { 200: knowledgeQuestionsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return knowledgeService.listQuestions(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The question key is a code from the question list, not a business
  // record, so there is no other business's id to name; a key that is not in this business's list answers 404.
  typedApp.put(
    '/knowledge/answers/:question_key',
    {
      config: { access: 'manager' },
      schema: {
        params: questionKeyParamsSchema,
        body: putAnswerRequestSchema,
        response: { 200: putAnswerResponseSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return knowledgeService.answerQuestion(request.principal, request.params.question_key, request.body);
    },
  );
}
