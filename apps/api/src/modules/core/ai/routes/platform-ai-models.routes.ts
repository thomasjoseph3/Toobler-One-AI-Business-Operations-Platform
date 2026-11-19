import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  addPlatformAiModelRequestSchema,
  platformAiModelIdParamsSchema,
  platformAiModelSchema,
  platformAiModelsResponseSchema,
  platformAiTaskParamsSchema,
  platformTaskModelsSchema,
  setPlatformTaskModelsRequestSchema,
  updatePlatformAiModelRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createPlatformAiModelsService } from '../services/platform-ai-models.service';

/**
 * Registers the platform team's control of the AI model list: GET and POST /api/v1/platform/ai/models, PATCH
 * /platform/ai/models/{id} and PUT /platform/ai/tasks/{taskId}/models (the order of models for a job).
 */
export function platformAiModelsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const service = createPlatformAiModelsService({ database: app.kernel.database });

  // Platform admins only (a flag on the person, set in the database): the guard answers 403 to everyone else and 401 to anyone not
  // signed in. The list is shared by every business.
  typedApp.get(
    '/platform/ai/models',
    { config: { access: 'platform' }, schema: { response: { 200: platformAiModelsResponseSchema } } },
    async () => service.listModels(),
  );

  typedApp.post(
    '/platform/ai/models',
    {
      config: { access: 'platform' },
      schema: { body: addPlatformAiModelRequestSchema, response: { 201: platformAiModelSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const model = await service.addModel(request.principal, request.body);
      return reply.code(201).send(model);
    },
  );

  typedApp.patch(
    '/platform/ai/models/:id',
    {
      config: { access: 'platform' },
      schema: {
        params: platformAiModelIdParamsSchema,
        body: updatePlatformAiModelRequestSchema,
        response: { 200: platformAiModelSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return service.updateModel(request.principal, request.params.id, request.body);
    },
  );

  typedApp.put(
    '/platform/ai/tasks/:taskId/models',
    {
      config: { access: 'platform' },
      schema: {
        params: platformAiTaskParamsSchema,
        body: setPlatformTaskModelsRequestSchema,
        response: { 200: platformTaskModelsSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return service.setTaskModels(request.principal, request.params.taskId, request.body.modelIds);
    },
  );
}
