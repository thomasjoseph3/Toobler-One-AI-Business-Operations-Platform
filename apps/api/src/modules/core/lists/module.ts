import { defineModule } from '../../../kernel/module-system/define';
import { listsRoutes } from './routes/lists.routes';

/**
 * Static contact lists (F11): a fixed group of contacts ("Diwali offer 2026"), saved from a contacts view or built by hand; Phase 4 campaigns use them.
 * A core module: always on. It asks the contacts module for the people (through its `index.ts`). Built in slices of at most 2 routes
 * (docs/features/F11-views-filters-search.md).
 */
export default defineModule({
  id: 'core.lists',
  kind: 'core',
  requires: ['core.contacts'],
  routes: (app) => {
    listsRoutes(app);
  },
});
