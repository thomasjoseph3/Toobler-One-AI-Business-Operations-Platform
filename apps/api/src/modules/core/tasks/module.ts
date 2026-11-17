import { defineModule } from '../../../kernel/module-system/define';
import { tasksRoutes } from './routes/tasks.routes';
import { createTaskAlertsService } from './services/task-alerts.service';

/**
 * Tasks and reminders (F08). A core module: always on. Built in slices of at most 2 routes
 * (docs/features/F08-tasks-and-reminders.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.tasks',
  kind: 'core',
  // A task is about a person and usually one of their leads (contacts, leads), and has an owner who is a person of the business (auth)
  requires: ['core.auth', 'core.contacts', 'core.leads'],
  jobs: [
    {
      // Runs by itself every minute. It has no business of its own: it queues one check per business.
      name: 'tasks.send_alerts',
      schedule: '* * * * *',
      run: async (job) => {
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('tasks.send_alerts_for_business', { accountId });
        }
      },
    },
    {
      // One business's reminders (before a task is due) and late alerts (after), in that business's fence. Safe to run twice: each task is
      // marked once its email has gone out.
      name: 'tasks.send_alerts_for_business',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const alerts = createTaskAlertsService({ database: job.services.database, mail: job.services.mail });
        const result = await alerts.sendAlertsForBusiness(job.accountContext.accountId);
        if (result.failed > 0)
          job.logger.warn({ failed: result.failed }, 'some task emails could not be sent; trying again next minute');
      },
    },
  ],
  routes: (app) => {
    tasksRoutes(app);
  },
});
