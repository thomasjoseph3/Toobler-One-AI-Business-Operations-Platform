import { defineModule } from '../../../kernel/module-system/define';
import { pipelineRoutes } from './routes/pipeline.routes';

/**
 * Leads and the pipeline board. A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F06-pipeline-and-leads.md); each feature folder registers its routes here with one line.
 */
export default defineModule({
  id: 'core.leads',
  kind: 'core',
  routes: (app) => {
    pipelineRoutes(app);
  },
});
