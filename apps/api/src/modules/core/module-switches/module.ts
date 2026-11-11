import { defineModule } from '../../../kernel/module-system/define';
import { modulesRoutes } from './routes/modules.routes';
import { createModuleGate } from './services/module-gate.service';
import { platformModulesRoutes } from './routes/platform-modules.routes';

/** Which modules each business has: the plan (entitled), the business's own switch (enabled), and the list of modules. */
export default defineModule({
  id: 'core.module_switches',
  kind: 'core',
  // The kernel uses this to know whether a module is on for a business. Tests remember nothing (0 seconds), so a change
  // made in a test counts at once; the running server remembers a business's answer for 10 seconds.
  moduleGate: ({ config, database, registry }) =>
    createModuleGate({ registry, database, cacheSeconds: config.env === 'test' ? 0 : 10 }),
  routes: (app) => {
    modulesRoutes(app);
    platformModulesRoutes(app);
  },
});
