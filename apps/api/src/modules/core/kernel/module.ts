import { defineModule } from '../../../kernel/modules/define';
import { kernelRoutes } from './routes';

/** Infrastructure routes every deployment has: health. */
export default defineModule({ id: 'core.kernel', kind: 'core', routes: kernelRoutes });
