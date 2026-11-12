import { defineModule } from '../../../kernel/module-system/define';

/**
 * Tickets: requests that are not sales (complaints, callbacks, questions). A core module: always on, so it has no switch.
 * Built in slices of at most 2 routes (docs/features/F14-tickets.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.tickets',
  kind: 'core',
  // Every ticket is about a contact, and the contacts module shows who they are
  requires: ['core.contacts'],
  routes: () => {
    // Slice 1 adds the first two routes here.
  },
});
