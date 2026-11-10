import { defineModule } from '../../../kernel/module-system/define';
import { signUpRoutes } from './sign-up/routes';

/**
 * Sign-up, sign-in, sessions and passwords. Built in slices (docs/features/F01-sign-up-and-sign-in.md): each feature
 * folder registers its routes here with one line.
 */
export default defineModule({
  id: 'core.auth',
  kind: 'core',
  // Sign-up checks the chosen industry against the industries module (through its index.ts only)
  requires: ['core.industries'],
  routes: (app) => {
    signUpRoutes(app);
  },
});
