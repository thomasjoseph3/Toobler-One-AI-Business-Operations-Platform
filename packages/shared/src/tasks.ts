import { z } from 'zod';

// Tasks between the API and the web app: a to-do with an owner and a due time ("Call Priya at 9 AM").

export const taskKindSchema = z.enum(['call', 'whatsapp', 'email', 'todo']);
export type TaskKind = z.infer<typeof taskKindSchema>;

/** Where a task stands now: done, late, due later today, or due after today. Worked out by the API from the due time, never stored. */
export const taskBucketSchema = z.enum(['overdue', 'today', 'upcoming', 'done']);
export type TaskBucket = z.infer<typeof taskBucketSchema>;

/** The longest task title the API accepts. */
export const MAX_TASK_TITLE_LENGTH = 200;

export const taskSchema = z.object({
  id: z.string(),
  kind: taskKindSchema,
  title: z.string(),
  /** When it is due (UTC, ISO). */
  dueAt: z.string(),
  bucket: taskBucketSchema,
  doneAt: z.string().nullable(),
  contact: z.object({ id: z.string(), name: z.string().nullable() }),
  /** The lead the task is about; null for a task on a person alone. */
  leadId: z.string().nullable(),
  /** Who looks after it; name is null when the person was removed. */
  owner: z.object({ userId: z.string(), name: z.string().nullable() }),
  /** The agent that made it (an AI promise); null for a task a person made. */
  createdByAgent: z.string().nullable(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

/**
 * What staff send to add a task: exactly one of `leadId` or `contactId`, the words, when it is due, optionally the kind (to-do when
 * missing) and the owner (the signed-in person when missing). The business, who made it and the time of making are never taken from the
 * request. Anything else in the body is refused.
 */
export const createTaskRequestSchema = z
  .object({
    leadId: z.uuid().optional(),
    contactId: z.uuid().optional(),
    kind: taskKindSchema.default('todo'),
    title: z.string().trim().min(1, 'Write what needs doing').max(MAX_TASK_TITLE_LENGTH, 'That title is too long'),
    dueAt: z.iso.datetime({ offset: true }),
    ownerUserId: z.uuid().optional(),
  })
  .strict()
  .refine((request) => (request.leadId === undefined) !== (request.contactId === undefined), {
    message: 'Send exactly one of leadId or contactId',
    path: ['leadId'],
  });
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

/**
 * The list of tasks: `due` picks a tab (nothing means every open task), `owner` is `me` or a person's id (nothing means everyone's; the
 * "own leads only" role always gets its own), and `lead_id` / `contact_id` narrow it to one lead or one person (a person's includes all
 * their leads).
 */
export const listTasksQuerySchema = z.object({
  due: taskBucketSchema.optional(),
  owner: z.union([z.literal('me'), z.uuid()]).optional(),
  lead_id: z.uuid().optional(),
  contact_id: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const tasksListResponseSchema = z.object({
  items: z.array(taskSchema),
  /** How many tasks match in all under the chosen tab, not just on this page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  /** How many tasks each tab holds for the same owner and lead or person filter, so the tabs can show their numbers. */
  counts: z.object({
    overdue: z.number().int(),
    today: z.number().int(),
    upcoming: z.number().int(),
    done: z.number().int(),
  }),
});
export type TasksListResponse = z.infer<typeof tasksListResponseSchema>;

/** The address part naming a task. */
export const taskIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What staff send to change a task: any of the words, the kind, the due time (this is also how a task is snoozed), `done` (true ticks it
 * off, false opens it again) and the owner (hands the task to another person of the business). At least one is needed. The business, the
 * person, the lead and who made it never change. Anything else in the body is refused.
 */
export const updateTaskRequestSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Write what needs doing')
      .max(MAX_TASK_TITLE_LENGTH, 'That title is too long')
      .optional(),
    kind: taskKindSchema.optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    done: z.boolean().optional(),
    ownerUserId: z.uuid().optional(),
  })
  .strict()
  .refine((request) => Object.values(request).some((value) => value !== undefined), {
    message: 'Send at least one thing to change',
  });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

/** The leads to ask the next due date of: their ids, separated by commas (`lead_ids=a,b,c`), at most 100 (the size of a list page). */
export const nextDueQuerySchema = z.object({
  lead_ids: z
    .string()
    .transform((text) => text.split(',').filter((id) => id.trim() !== ''))
    .pipe(z.array(z.uuid()).min(1).max(100)),
});
export type NextDueQuery = z.infer<typeof nextDueQuerySchema>;

/**
 * For each asked-about lead: when its earliest open task is due (a UTC moment), or null when it has none (and for a lead the person cannot see).
 * It is the date in the "Next activity" column of the Leads list.
 */
export const nextDueResponseSchema = z.object({ dates: z.record(z.string(), z.string().nullable()) });
export type NextDueResponse = z.infer<typeof nextDueResponseSchema>;
