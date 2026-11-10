import { defineModule } from '../../../kernel/modules/define';
import { createSessionAuthenticator } from './authenticator';
import { authRoutes } from './routes';

/** Sign-up, sign-in, sessions and passwords. Also provides the authenticator the kernel uses to know who is signed in. */
export default defineModule({
  id: 'core.auth',
  kind: 'core',
  routes: authRoutes,
  authenticator: createSessionAuthenticator,
});
