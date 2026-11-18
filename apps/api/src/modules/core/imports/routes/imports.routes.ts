import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  importIdParamsSchema,
  importSchema,
  MAX_IMPORT_FILE_BYTES,
  setImportMappingRequestSchema,
} from '@toobler-one/shared';
import { ApiError, unauthorized } from '../../../../kernel/errors';
import { createImportsService } from '../services/imports.service';

/** Registers /api/v1/imports (upload a spreadsheet, set its columns, run it, read its progress). Managers only. */
export async function importsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const importsService = createImportsService({
    database: app.kernel.database,
    enqueueJob: (jobName, data) => app.kernel.enqueueJob(jobName, data),
  });
  // Only these routes accept a file: one file, no more than 10 MB (a bigger one is cut off and refused)
  await app.register(multipart, { limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 5, parts: 6 } });

  // For managers only (the guard answers 403 to staff). The file is read and kept for the next steps; nothing is imported yet.
  typedApp.post(
    '/imports',
    {
      config: { access: 'manager' },
      // The app-wide body limit is 1 MB; this one route takes a file, so it may carry the biggest file plus the form's own few bytes
      bodyLimit: MAX_IMPORT_FILE_BYTES + 64 * 1024,
      schema: { response: { 201: importSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      if (!request.isMultipart()) throw new ApiError(400, 'FILE_REQUIRED', 'Send the spreadsheet as a file upload.');
      const upload = await request.file();
      if (!upload) throw new ApiError(400, 'FILE_REQUIRED', 'Choose a spreadsheet file to import.');
      // The upload stops at the limit and throws its own error; the person gets one plain sentence
      let content: Buffer;
      try {
        content = await upload.toBuffer();
      } catch (error) {
        if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new ApiError(413, 'FILE_TOO_LARGE', 'That file is bigger than 10 MB. Split it into smaller files.');
        }
        throw error;
      }
      if (upload.file.truncated)
        throw new ApiError(413, 'FILE_TOO_LARGE', 'That file is bigger than 10 MB. Split it into smaller files.');
      const created = await importsService.createImport(request.principal, { fileName: upload.filename, content });
      return reply.code(201).send(created);
    },
  );

  // For managers only. Sets which column is which; answers with the counts that gives (new, matching, skipped).
  typedApp.patch(
    '/imports/:id',
    {
      config: { access: 'manager' },
      schema: { params: importIdParamsSchema, body: setImportMappingRequestSchema, response: { 200: importSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return importsService.setMapping(request.principal, request.params.id, request.body);
    },
  );

  // For managers only. Starts the import in the background; answers at once with the import as running.
  typedApp.post(
    '/imports/:id/run',
    {
      config: { access: 'manager' },
      schema: { params: importIdParamsSchema, response: { 202: importSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const started = await importsService.runImport(request.principal, request.params.id);
      return reply.code(202).send(started);
    },
  );

  // For managers only. A plain read of the progress and, when it is done, the counts and the report.
  typedApp.get(
    '/imports/:id',
    { config: { access: 'manager' }, schema: { params: importIdParamsSchema, response: { 200: importSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return importsService.getImport(request.principal, request.params.id);
    },
  );
}
