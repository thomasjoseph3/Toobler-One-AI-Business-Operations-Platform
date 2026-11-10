import { defineModule } from '../../../kernel/module-system/define';
import { healthRoutes } from './routes';

/** Infrastructure routes every deployment has: health. */
export default defineModule({ id: 'core.health', kind: 'core', routes: healthRoutes });
