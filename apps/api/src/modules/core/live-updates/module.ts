import { defineModule } from '../../../kernel/module-system/define';
import { liveUpdatesRoutes } from './routes/live-updates.routes';

/**
 * Live updates (F21): `GET /events`, a stream that tells a signed-in person's open screens that something changed in their own business (a new message,
 * a takeover, a conversation done) so they refetch what they show. A core module: always on. It reads the event outbox; it never receives events
 * from other modules directly, so it works however many API processes run. Later features (Today, alerts) add their event names to its list.
 */
export default defineModule({
  id: 'core.live',
  kind: 'core',
  requires: ['core.auth'],
  routes: (app) => {
    liveUpdatesRoutes(app);
  },
});
