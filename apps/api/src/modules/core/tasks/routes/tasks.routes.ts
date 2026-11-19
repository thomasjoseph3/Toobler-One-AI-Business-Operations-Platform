import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createTaskRequestSchema,
  listTasksQuerySchema,
  nextDueQuerySchema,
  nextDueResponseSchema,
  taskIdParamsSchema,
  taskSchema,
  tasksListResponseSchema,
  updateTaskRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTasksService } from '../services/tasks.service';

/** Registers /api/v1/tasks (add a task, list tasks) and /api/v1/tasks/{id} (change or delete one). */
export function tasksRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const tasksService = createTasksService({ database: app.kernel.database });

  // For any signed-in, verified person. The business and who made the task come from the session, never from the request.
  typedApp.post(
    '/tasks',
    { config: { access: 'staff' }, schema: { body: createTaskRequestSchema, response: { 201: taskSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const task = await tasksService.createTask(request.principal, request.body);
      return reply.code(201).send(task);
    },
  );

  // For any signed-in, verified person. A plain read for the Leads list: the due date of each asked-about lead's earliest open task. Registered before
  // /tasks/:id so the word "next-due" is never mistaken for an id.
  typedApp.get(
    '/tasks/next-due',
    {
      config: { access: 'staff' },
      schema: { querystring: nextDueQuerySchema, response: { 200: nextDueResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return tasksService.getNextDueDates(request.principal, request.query.lead_ids);
    },
  );

  // For any signed-in, verified person. A plain read: one tab of tasks (Overdue, Today, Upcoming, Done) with the numbers of all four.
  typedApp.get(
    '/tasks',
    {
      config: { access: 'staff' },
      schema: { querystring: listTasksQuerySchema, response: { 200: tasksListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return tasksService.listTasks(request.principal, request.query);
    },
  );

  // For any signed-in, verified person: complete, snooze (a new due time), reassign or edit. The service keeps the "own leads only" role to its own tasks.
  typedApp.patch(
    '/tasks/:id',
    {
      config: { access: 'staff' },
      schema: { params: taskIdParamsSchema, body: updateTaskRequestSchema, response: { 200: taskSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return tasksService.updateTask(request.principal, request.params.id, request.body);
    },
  );

  // For any signed-in, verified person (API.md: Staff). A soft delete: the task disappears, its row is kept.
  typedApp.delete(
    '/tasks/:id',
    { config: { access: 'staff' }, schema: { params: taskIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await tasksService.deleteTask(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
