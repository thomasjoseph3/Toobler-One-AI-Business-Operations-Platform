import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { blockListResponseSchema, replaceBlockListRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createBlockListService } from '../services/block-list.service';

/** Registers /api/v1/block-list (read, save the whole list). */
export function blockListRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const blockListService = createBlockListService({ database: app.kernel.database });

  // Managers only: who is blocked is the business's decision, and the list holds personal data. The business comes from the session.
  typedApp.get(
    '/block-list',
    { config: { access: 'manager' }, schema: { response: { 200: blockListResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return blockListService.listBlockList(request.principal);
    },
  );

  // Managers only. Saves the whole list: what is sent is what the business has afterwards (an empty list clears it).
  typedApp.put(
    '/block-list',
    {
      config: { access: 'manager' },
      schema: { body: replaceBlockListRequestSchema, response: { 200: blockListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return blockListService.replaceBlockList(request.principal, request.body);
    },
  );
}
