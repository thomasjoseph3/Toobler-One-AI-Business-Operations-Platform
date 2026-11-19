import { z } from 'zod';

// The activity log between the API and the web app: who did what, when. The words of notes, messages and settings are never in it, only
// which kind of thing happened and which fields changed.

/** `GET /audit-log` filters: one person, one or more areas (the part of a kind before the dot, like `team` or `leads`), a time range, and the page. */
export const auditLogQuerySchema = z.object({
  /** Only what this person did. */
  person: z.uuid().optional(),
  /** One area or several separated by commas (`team,teams`). */
  area: z
    .string()
    .transform((text) => text.split(',').filter((area) => area.trim() !== ''))
    .pipe(
      z
        .array(z.string().regex(/^[a-z_]+$/))
        .min(1)
        .max(12),
    )
    .optional(),
  /** Only lines at or after this moment (ISO, with its offset). */
  from: z.iso.datetime({ offset: true }).optional(),
  /** Only lines before this moment (ISO, with its offset). */
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** One line of the activity log. */
export const auditLogLineSchema = z.object({
  id: z.string(),
  /** What happened, like `team.invited` (the web app turns it into words). */
  kind: z.string(),
  /** Who did it: a person (with their name, null if unknown), the AI agent, an import or the system. */
  actor: z.object({
    kind: z.string(),
    userId: z.string().nullable(),
    name: z.string().nullable(),
  }),
  recordType: z.string().nullable(),
  recordId: z.string().nullable(),
  /** The NAMES of the fields that changed, never their values. */
  fields: z.array(z.string()),
  createdAt: z.string(),
});
export type AuditLogLine = z.infer<typeof auditLogLineSchema>;

export const auditLogResponseSchema = z.object({
  items: z.array(auditLogLineSchema),
  /** How many lines match in all, not just on this page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;
