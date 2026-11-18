import { defineModule } from '../../../kernel/module-system/define';
import { companiesRoutes } from './routes/companies.routes';
import { handleTeamMemberRemoved } from './services/team-events.service';

/**
 * Companies (F05): the firms, schools, families and groups that contacts belong to. A core module: always on. Built in slices of at most 2 routes
 * (docs/features/F05-companies.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.companies',
  kind: 'core',
  // A company's people are contacts and their leads add up on its page (contacts, leads); its owner is a person of the business (auth)
  requires: ['core.auth', 'core.contacts', 'core.leads'],
  // When a person is removed from the team, the companies they looked after go to the person the manager chose
  events: { 'team.member_removed': handleTeamMemberRemoved },
  routes: (app) => {
    companiesRoutes(app);
  },
});
