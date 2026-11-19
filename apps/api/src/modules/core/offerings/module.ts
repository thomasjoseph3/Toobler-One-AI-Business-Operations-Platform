import { defineModule } from '../../../kernel/module-system/define';
import { offeringsRoutes } from './routes/offerings.routes';
import { offersRoutes } from './routes/offers.routes';
import { handleTeamMemberRemoved } from './services/team-events.service';

/**
 * What the business sells (offerings) and its time-limited promotions (offers). A core module: always on, so it has no
 * switch, and shared: the Phase 2 sales engine extends these same offerings. Built in slices of at most 2 routes
 * (docs/features/F17-offerings-and-offers.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.offerings',
  kind: 'core',
  // When a person is removed from the team, the offerings they looked after go to the person the manager chose
  events: { 'team.member_removed': handleTeamMemberRemoved },
  routes: (app) => {
    offeringsRoutes(app);
    offersRoutes(app);
  },
});
