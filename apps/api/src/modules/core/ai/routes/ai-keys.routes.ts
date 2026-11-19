import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  addAiKeyRequestSchema,
  aiKeyIdParamsSchema,
  aiKeySchema,
  aiKeysResponseSchema,
  aiKeyTestResultSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createAiKeysService } from '../services/ai-keys.service';

/** Registers POST and GET /api/v1/ai/keys, DELETE /ai/keys/{id} and POST /ai/keys/{id}/test. */
export function aiKeysRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const aiKeysService = createAiKeysService({
    database: app.kernel.database,
    config: app.kernel.config,
    llm: app.kernel.llm,
  });

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request. The key
  // travels in the body, only on this request, and is never returned.
  typedApp.post(
    '/ai/keys',
    { config: { access: 'manager' }, schema: { body: addAiKeyRequestSchema, response: { 201: aiKeySchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const savedKey = await aiKeysService.addKey(request.principal, request.body);
      return reply.code(201).send(savedKey);
    },
  );

  // For managers only. Lists the business's saved keys as previews with their status. Never the keys.
  typedApp.get(
    '/ai/keys',
    { config: { access: 'manager' }, schema: { response: { 200: aiKeysResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return aiKeysService.listKeys(request.principal);
    },
  );

  // For managers only. Removes a key and wipes its secret. Another business's key answers 404, exactly like a missing one.
  typedApp.delete(
    '/ai/keys/:id',
    { config: { access: 'manager' }, schema: { params: aiKeyIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized();
      await aiKeysService.removeKey(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );

  // For managers only. Makes one tiny real call with the key, so it is limited to 10 a minute from one address. Another
  // business's key answers 404.
  typedApp.post(
    '/ai/keys/:id/test',
    {
      config: { access: 'manager', ...routeLimit(app, 'testAiKey') },
      schema: { params: aiKeyIdParamsSchema, response: { 200: aiKeyTestResultSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return aiKeysService.testKey(request.principal, request.params.id);
    },
  );
}
