import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { todayQuerySchema, todayResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTodayService } from '../services/today.service';

/** Registers GET /api/v1/today, the one read behind the Today page. */
export function todayRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const todayService = createTodayService({ database: app.kernel.database });

  // For any signed-in, verified person. A plain read: every section of their Today page. The business and who is asking
  // come from the session; `scope` (me or the team) is the only input. The own-leads-only role is held to its own.
  typedApp.get(
    '/today',
    {
      config: { access: 'staff' },
      schema: { querystring: todayQuerySchema, response: { 200: todayResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return todayService.getToday(request.principal, request.query);
    },
  );
}
