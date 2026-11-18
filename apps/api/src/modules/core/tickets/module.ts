import { defineModule } from '../../../kernel/module-system/define';
import { ticketsRoutes } from './routes/tickets.routes';
import { handleTeamMemberRemoved } from './services/team-events.service';

/**
 * Tickets: requests that are not sales (complaints, callbacks, questions). A core module: always on, so it has no switch.
 * Built in slices of at most 2 routes (docs/features/F14-tickets.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.tickets',
  kind: 'core',
  // Every ticket is about a contact, and the contacts module shows who they are
  requires: ['core.contacts'],
  // When a person is removed from the team, their open tickets go to the person the manager chose
  events: { 'team.member_removed': handleTeamMemberRemoved },
  routes: (app) => {
    ticketsRoutes(app);
  },
});
