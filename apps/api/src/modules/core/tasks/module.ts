import { defineModule } from '../../../kernel/module-system/define';
import { tasksRoutes } from './routes/tasks.routes';

/**
 * Tasks and reminders (F08). A core module: always on. Built in slices of at most 2 routes
 * (docs/features/F08-tasks-and-reminders.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.tasks',
  kind: 'core',
  // A task is about a person and usually one of their leads (contacts, leads), and has an owner who is a person of the business (auth)
  requires: ['core.auth', 'core.contacts', 'core.leads'],
  routes: (app) => {
    tasksRoutes(app);
  },
});
