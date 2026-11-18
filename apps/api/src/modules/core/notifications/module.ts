import { defineModule } from '../../../kernel/module-system/define';

/**
 * Staff alerts and the morning summary (F23): tells staff about the things that need them — a hot lead, a callback due
 * or late, a customer asking for a person — on WhatsApp, with email as a back-up, plus a morning summary for managers.
 * A core module: always on.
 *
 * In progress (docs/features/F23-staff-alerts.md). The rules for who an alert goes to and whether it may go out now are
 * pure and unit-tested in helpers/alert-rules.ts; the tables, event handlers, the morning-summary job and the settings
 * screens are the remaining slices. The module is registered in modules/index.ts once it has routes or jobs.
 */
export default defineModule({
  id: 'core.notifications',
  kind: 'core',
  requires: ['core.auth'],
});
