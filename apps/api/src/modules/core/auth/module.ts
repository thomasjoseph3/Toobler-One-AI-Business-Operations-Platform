import { defineModule } from '../../../kernel/module-system/define';
import { signUpRoutes } from './sign-up/routes';

/**
 * Sign-up, sign-in, sessions and passwords. Built in slices (docs/features/F01-sign-up-and-sign-in.md): each feature
 * folder registers its routes here with one line.
 */
export default defineModule({
  id: 'core.auth',
  kind: 'core',
  routes: (app) => {
    signUpRoutes(app);
  },
});
