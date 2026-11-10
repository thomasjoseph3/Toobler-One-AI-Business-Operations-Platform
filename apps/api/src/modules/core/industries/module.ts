import { defineModule } from '../../../kernel/module-system/define';
import { industriesRoutes } from './routes';

/** The kinds of business a person can pick at sign-up. The list lives in the database. */
export default defineModule({ id: 'core.industries', kind: 'core', routes: industriesRoutes });
