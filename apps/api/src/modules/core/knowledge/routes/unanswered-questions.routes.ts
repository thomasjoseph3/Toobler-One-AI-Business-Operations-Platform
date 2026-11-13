import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  answerUnansweredQuestionRequestSchema,
  faqSchema,
  listUnansweredQuestionsQuerySchema,
  unansweredQuestionIdParamsSchema,
  unansweredQuestionSchema,
  unansweredQuestionsResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createUnansweredQuestionsService } from '../services/unanswered-questions.service';

/** Registers /api/v1/knowledge/unanswered (list) and /knowledge/unanswered/{id}/answer and /dismiss. */
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

  // For any signed-in, verified person. Turns the question into a new FAQ (201 with the FAQ). Another business's question answers 404.
  typedApp.post(
    '/knowledge/unanswered/:id/answer',
    {
      config: { access: 'staff' },
      schema: {
        params: unansweredQuestionIdParamsSchema,
        body: answerUnansweredQuestionRequestSchema,
        response: { 201: faqSchema },
      },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const faq = await unansweredQuestionsService.answerUnansweredQuestion(
        request.principal,
        request.params.id,
        request.body,
      );
      return reply.code(201).send(faq);
    },
  );

  // For any signed-in, verified person. Takes the question off the open list. It needs no body.
  typedApp.post(
    '/knowledge/unanswered/:id/dismiss',
    {
      config: { access: 'staff' },
      schema: { params: unansweredQuestionIdParamsSchema, response: { 200: unansweredQuestionSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return unansweredQuestionsService.dismissUnansweredQuestion(request.principal, request.params.id);
    },
  );
}
