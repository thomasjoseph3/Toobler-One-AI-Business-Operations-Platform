import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { lostReasonsResponseSchema, replaceLostReasonsRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createLostReasonsService } from '../services/lost-reasons.service';

/** Registers /api/v1/lost-reasons (read the list, replace the list). */
export function lostReasonsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const lostReasonsService = createLostReasonsService({ database: app.kernel.database });

  // For any signed-in, verified person: staff need the list for the Lost dialog. A plain read.
  typedApp.get(
    '/lost-reasons',
    { config: { access: 'staff' }, schema: { response: { 200: lostReasonsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return lostReasonsService.listLostReasons(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.put(
    '/lost-reasons',
    {
      config: { access: 'manager' },
      schema: { body: replaceLostReasonsRequestSchema, response: { 200: lostReasonsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return lostReasonsService.replaceLostReasons(request.principal, request.body);
    },
  );
}
