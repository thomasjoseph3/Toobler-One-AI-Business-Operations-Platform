import { defineModule } from '../../../kernel/module-system/define';
import { contactsRoutes } from './routes/contacts.routes';
import { handleFieldValuesPurged } from './services/field-purge-events.service';

/** The people a business deals with. A core module: always on, so it has no switch. */
export default defineModule({
  id: 'core.contacts',
  kind: 'core',
  requires: ['core.fields'],
  // When a removed custom field's answers are purged, its answers are taken out of the contacts
  events: { 'field.values_purged': handleFieldValuesPurged },
  routes: contactsRoutes,
});
