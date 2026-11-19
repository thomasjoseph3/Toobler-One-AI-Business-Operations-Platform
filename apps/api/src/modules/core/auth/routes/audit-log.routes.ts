import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { auditLogQuerySchema, auditLogResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createAuditLogService } from '../services/audit-log.service';

/** Registers GET /api/v1/audit-log: who did what, when, for the business's managers. */
export function auditLogRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const auditLogService = createAuditLogService({ database: app.kernel.database });

  // Managers only (it shows what every person did). A plain read; the business comes from the session, never from the request.
  typedApp.get(
    '/audit-log',
    {
      config: { access: 'manager' },
      schema: { querystring: auditLogQuerySchema, response: { 200: auditLogResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return auditLogService.listAuditLog(request.principal, request.query);
    },
  );
}
