import { defineModule } from '../../../kernel/module-system/define';
import { viewsRoutes } from './routes/views.routes';

/**
 * Saved views (F11): a named way of looking at a list (its filters, sort and layout), found again as a tab. A core module: always on. It requires nothing:
 * a view is only a saved set of words, and the list itself applies them. Built in slices of at most 2 routes (docs/features/F11-views-filters-search.md).
 */
export default defineModule({
  id: 'core.views',
  kind: 'core',
  routes: (app) => {
    viewsRoutes(app);
  },
});
