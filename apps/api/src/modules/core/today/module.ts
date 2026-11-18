import { defineModule } from '../../../kernel/module-system/define';

/**
 * Today page (F22): the first screen staff see — "who do I call next?". A core module: always on. It owns no table and
 * adds no write route; it only reads leads, tasks, their people and the setup steps through each module's public API.
 *
 * In progress (docs/features/F22-today-page.md). The section logic is built and unit-tested in
 * helpers/today-sections.ts; the read endpoint (`GET /api/v1/today?scope=me|team`), its service and the screen are the
 * remaining slices. The module is registered in modules/index.ts once its route exists.
 */
export default defineModule({
  id: 'core.today',
  kind: 'core',
  // The modules whose public API (index.ts) Today reads from, once the service is built.
  requires: ['core.auth', 'core.leads', 'core.tasks', 'core.setup'],
});
