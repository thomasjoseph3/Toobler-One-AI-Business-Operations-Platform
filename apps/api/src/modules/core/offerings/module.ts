import { defineModule } from '../../../kernel/module-system/define';
import { offeringsRoutes } from './routes/offerings.routes';

/**
 * What the business sells (offerings) and its time-limited promotions (offers). A core module: always on, so it has no
 * switch, and shared: the Phase 2 sales engine extends these same offerings. Built in slices of at most 2 routes
 * (docs/features/F17-offerings-and-offers.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.offerings',
  kind: 'core',
  routes: (app) => {
    offeringsRoutes(app);
  },
});
