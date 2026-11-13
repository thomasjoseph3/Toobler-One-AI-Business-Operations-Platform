import { defineModule } from '../../../kernel/module-system/define';
import { assignmentRulesRoutes } from './routes/assignment-rules.routes';
import { handleContactUnmarkedNotAFit } from './services/lifecycle-events.service';
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
  // Shows who a lead is for, and keeps a contact's lifecycle stage in step with its leads, through the contacts module; shows which
  // offering a lead is about and who looks after it (for sharing out by offering), through the offerings module
  requires: ['core.contacts', 'core.offerings'],
  // When staff take the "not a fit" mark off a contact, its stage is worked out again from its leads
  events: { 'contact.unmarked_not_a_fit': handleContactUnmarkedNotAFit },
  routes: (app) => {
    pipelineRoutes(app);
    lostReasonsRoutes(app);
    leadsRoutes(app);
    assignmentRulesRoutes(app);
  },
});
