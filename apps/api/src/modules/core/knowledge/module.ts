import { defineModule } from '../../../kernel/module-system/define';
import { knowledgeRoutes } from './routes/knowledge.routes';
import { settingsRoutes } from './routes/settings.routes';
import { situationsRoutes } from './routes/situations.routes';

/**
 * The business profile and situations: the fixed business questions, the answers to them, and how the business wants common
 * moments handled. A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F16-business-profile.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.knowledge',
  kind: 'core',
  // The business's time zone and default country live on the business itself, which the sign-in module owns
  requires: ['core.auth'],
  routes: (app) => {
    knowledgeRoutes(app);
    situationsRoutes(app);
    settingsRoutes(app);
  },
});
