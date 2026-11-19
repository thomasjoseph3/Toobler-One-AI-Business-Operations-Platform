import { z } from 'zod';

// Exports between the API and the web app (F12): a manager downloads a list as a CSV file. The file is built in the background, kept for 24 hours and
// downloaded through the manager's own session.

export const exportObjectSchema = z.enum(['contact', 'company', 'lead']);
export type ExportObject = z.infer<typeof exportObjectSchema>;

export const exportStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);
export type ExportStatus = z.infer<typeof exportStatusSchema>;

/** How long a finished export can be downloaded, in hours. */
export const EXPORT_KEPT_HOURS = 24;

/**
 * What a manager sends to export a list: which list, and the list's own address query (`q=menon&filters=...`, without the page), so the file holds exactly
 * what the list shows. The query is checked against that list's own rules when the request is made.
 */
export const createExportRequestSchema = z
  .object({
    object: exportObjectSchema,
    query: z.string().max(5000).default(''),
  })
  .strict();
export type CreateExportRequest = z.infer<typeof createExportRequestSchema>;

export const exportIdParamsSchema = z.object({ id: z.uuid() });

/** An export as the API answers. */
export const exportSchema = z.object({
  id: z.string(),
  object: exportObjectSchema,
  status: exportStatusSchema,
  fileName: z.string().nullable(),
  rowCount: z.number().int().nullable(),
  /** When the file stops being available (24 hours after it was built), or null while it is not built. */
  expiresAt: z.string().nullable(),
  /** The address to download the file from (while it is built and not expired), or null. */
  downloadPath: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type Export = z.infer<typeof exportSchema>;
