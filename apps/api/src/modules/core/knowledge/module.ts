import { defineModule } from '../../../kernel/module-system/define';

/**
 * The business profile and situations: the fixed business questions, the answers to them, and how the business wants common
 * moments handled. A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F16-business-profile.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.knowledge',
  kind: 'core',
  routes: () => {
    // Slice 1 adds the first two routes here.
  },
});
