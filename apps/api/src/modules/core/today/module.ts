import { defineModule } from '../../../kernel/module-system/define';
import { todayRoutes } from './routes/today.routes';

/**
 * Today page (F22): the first screen staff see — "who do I call next?". A core module: always on. It owns no table and
 * adds no write route; it only reads leads, tasks, their people and the setup steps through each module's public API.
 * The section logic and the day/week boundaries are pure (helpers/), each with its own unit test; the screen is the
 * remaining slice (docs/features/F22-today-page.md).
 */
export default defineModule({
  id: 'core.today',
  kind: 'core',
  // The modules whose public API (index.ts) Today reads from.
  requires: ['core.auth', 'core.contacts', 'core.activities', 'core.leads', 'core.tasks', 'core.setup'],
  routes: (app) => {
    todayRoutes(app);
  },
});
