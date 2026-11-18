import { defineModule } from '../../../kernel/module-system/define';
import { searchRoutes } from './routes/search.routes';

/**
 * Search (F11): the box at the top of every page, finding contacts, companies and leads. A core module: always on. It owns no table; it asks the contacts,
 * companies and leads modules through their `index.ts`. Built in slices (docs/features/F11-views-filters-search.md).
 */
export default defineModule({
  id: 'core.search',
  kind: 'core',
  requires: ['core.contacts', 'core.companies', 'core.leads'],
  routes: (app) => {
    searchRoutes(app);
  },
});
