import { defineModule } from '../../../kernel/module-system/define';
import { authRoutes } from './routes';

/** Sign-up, sign-in, sessions and passwords. Built in slices (docs/features/F01-sign-up-and-sign-in.md). */
export default defineModule({ id: 'core.auth', kind: 'core', routes: authRoutes });
