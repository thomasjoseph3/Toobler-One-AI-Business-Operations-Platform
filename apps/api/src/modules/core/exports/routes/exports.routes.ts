import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createExportRequestSchema, exportIdParamsSchema, exportSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createExportsService } from '../services/exports.service';

/** Registers /api/v1/exports (ask for a CSV of a list, read its status, download it). Managers only. */
export function exportsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const exportsService = createExportsService({
    database: app.kernel.database,
    enqueueJob: (jobName, data) => app.kernel.enqueueJob(jobName, data),
  });

  // For managers only (the guard answers 403 to staff). Asks for an export of a list; a background job builds it and emails the manager. Answers at once.
  typedApp.post(
    '/exports',
    { config: { access: 'manager' }, schema: { body: createExportRequestSchema, response: { 202: exportSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const requested = await exportsService.requestExport(request.principal, request.body);
      return reply.code(202).send(requested);
    },
  );

  // For managers only. A plain read of the status and, once the file is built, the address to download it from.
  typedApp.get(
    '/exports/:id',
    { config: { access: 'manager' }, schema: { params: exportIdParamsSchema, response: { 200: exportSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return exportsService.getExport(request.principal, request.params.id);
    },
  );

  // For managers only. Gives the CSV file itself (as a download); it is never kept by browsers or caches.
  typedApp.get(
    '/exports/:id/download',
    { config: { access: 'manager' }, schema: { params: exportIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const file = await exportsService.downloadExport(request.principal, request.params.id);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${file.fileName}"`)
        .header('cache-control', 'no-store')
        .send(file.content);
    },
  );
}
