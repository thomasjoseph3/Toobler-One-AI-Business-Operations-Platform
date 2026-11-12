import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createStageRequestSchema,
  pipelineSchema,
  pipelineStageSchema,
  removeStageQuerySchema,
  reorderStagesRequestSchema,
  stageIdParamsSchema,
  updateStageRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createPipelineService } from '../services/pipeline.service';

/** Registers /api/v1/pipeline (read), /pipeline/stages (add), /pipeline/stages/{id} (rename, remove) and /pipeline/stages/reorder. */
export function pipelineRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const pipelineService = createPipelineService({ database: app.kernel.database });

  // For any signed-in, verified person. A plain read: the stages in board order with their lead counts.
  typedApp.get(
    '/pipeline',
    { config: { access: 'staff' }, schema: { response: { 200: pipelineSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return pipelineService.getPipeline(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.post(
    '/pipeline/stages',
    {
      config: { access: 'manager' },
      schema: { body: createStageRequestSchema, response: { 201: pipelineStageSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const stage = await pipelineService.createStage(request.principal, request.body);
      return reply.code(201).send(stage);
    },
  );

  // For managers only. The address `reorder` is fixed text, so it is never mistaken for a stage id.
  typedApp.post(
    '/pipeline/stages/reorder',
    {
      config: { access: 'manager' },
      schema: { body: reorderStagesRequestSchema, response: { 200: pipelineSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return pipelineService.reorderStages(request.principal, request.body);
    },
  );

  // For managers only. Another business's stage and an unknown id both answer 404.
  typedApp.patch(
    '/pipeline/stages/:id',
    {
      config: { access: 'manager' },
      schema: { params: stageIdParamsSchema, body: updateStageRequestSchema, response: { 200: pipelineStageSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return pipelineService.renameStage(request.principal, request.params.id, request.body);
    },
  );

  // For managers only. Another business's stage and an unknown id both answer 404. Answers with the whole pipeline.
  typedApp.delete(
    '/pipeline/stages/:id',
    {
      config: { access: 'manager' },
      schema: { params: stageIdParamsSchema, querystring: removeStageQuerySchema, response: { 200: pipelineSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return pipelineService.removeStage(request.principal, request.params.id, request.query);
    },
  );
}
