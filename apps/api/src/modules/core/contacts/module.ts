import { defineModule } from '../../../kernel/module-system/define';
import { contactsRoutes } from './routes/contacts.routes';

/** The people a business deals with. A core module: always on, so it has no switch. */
export default defineModule({ id: 'core.contacts', kind: 'core', routes: contactsRoutes });
