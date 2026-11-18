import { defineModule } from '../../../kernel/module-system/define';
import { fieldsRoutes } from './routes/fields.routes';

/**
 * Custom fields (F09): what each business adds to its contacts, companies and leads. A core module: always on. It requires nothing; the contacts,
 * companies and leads modules require it, to check the values of their custom fields. Built in slices of at most 2 routes
 * (docs/features/F09-custom-fields.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.fields',
  kind: 'core',
  routes: (app) => {
    fieldsRoutes(app);
  },
});
