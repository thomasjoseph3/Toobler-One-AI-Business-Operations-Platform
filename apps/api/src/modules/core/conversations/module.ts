import { defineModule } from '../../../kernel/module-system/define';
import { conversationTypesRoutes } from './routes/conversation-types.routes';

/**
 * Conversations: how every conversation, on any channel, is sorted into a type and what happens next (a lead, a ticket, a log
 * line, the Filtered tab). A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F15-conversation-types-and-router.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.conversations',
  kind: 'core',
  // The router raises leads and tickets for contacts, and sorting is done by the AI service
  requires: ['core.contacts', 'core.leads', 'core.tickets', 'core.ai'],
  routes: (app) => {
    conversationTypesRoutes(app);
  },
});
