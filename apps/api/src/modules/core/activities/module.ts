import { defineModule } from '../../../kernel/module-system/define';
import { activitiesRoutes } from './routes/activities.routes';
import {
  handleLeadCreated,
  handleLeadMoved,
  handleTaskCompleted,
  handleTaskCreated,
} from './services/timeline-events.service';

/**
 * The activity timeline and notes (F07). A core module: always on. Built in slices of at most 2 routes
 * (docs/features/F07-timeline-and-notes.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.activities',
  kind: 'core',
  // A note is about a person and usually one of their leads (contacts, leads), and it shows who wrote it (auth)
  requires: ['core.auth', 'core.contacts', 'core.leads', 'core.tasks'],
  // The lead's own news goes on its timeline: a new lead, a lead moving to another stage, a task added or ticked off
  events: {
    'lead.created': handleLeadCreated,
    'lead.moved': handleLeadMoved,
    'task.created': handleTaskCreated,
    'task.completed': handleTaskCompleted,
  },
  routes: (app) => {
    activitiesRoutes(app);
  },
});
