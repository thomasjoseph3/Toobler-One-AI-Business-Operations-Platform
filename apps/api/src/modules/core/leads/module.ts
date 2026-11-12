import { defineModule } from '../../../kernel/module-system/define';
import { leadsRoutes } from './routes/leads.routes';
import { lostReasonsRoutes } from './routes/lost-reasons.routes';
import { pipelineRoutes } from './routes/pipeline.routes';

/**
 * Leads and the pipeline board. A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F06-pipeline-and-leads.md); each feature folder registers its routes here with one line.
 */
export default defineModule({
  id: 'core.leads',
  kind: 'core',
  // Shows who a lead is for, and keeps a contact's lifecycle stage in step with its leads, through the contacts module
  requires: ['core.contacts'],
  routes: (app) => {
    pipelineRoutes(app);
    lostReasonsRoutes(app);
    leadsRoutes(app);
  },
});
