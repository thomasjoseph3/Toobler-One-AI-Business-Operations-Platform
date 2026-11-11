import { defineModule } from '../../../kernel/module-system/define';
import { modulesRoutes } from './routes/modules.routes';

/** Which modules each business has: the plan (entitled), the business's own switch (enabled), and the list of modules. */
export default defineModule({ id: 'core.module_switches', kind: 'core', routes: modulesRoutes });
