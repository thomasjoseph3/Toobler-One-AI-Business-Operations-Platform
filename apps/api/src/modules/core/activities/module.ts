import { defineModule } from '../../../kernel/module-system/define';
import { activitiesRoutes } from './routes/activities.routes';

/**
 * The activity timeline and notes (F07). A core module: always on. Built in slices of at most 2 routes
 * (docs/features/F07-timeline-and-notes.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.activities',
  kind: 'core',
  // A note is about a person and usually one of their leads (contacts, leads), and it shows who wrote it (auth)
  requires: ['core.auth', 'core.contacts', 'core.leads'],
  routes: (app) => {
    activitiesRoutes(app);
  },
});
