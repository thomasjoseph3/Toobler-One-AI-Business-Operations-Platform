import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createTaskRequestSchema,
  listTasksQuerySchema,
  taskSchema,
  tasksListResponseSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTasksService } from '../services/tasks.service';

/** Registers /api/v1/tasks (add a task, list tasks). */
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
}
