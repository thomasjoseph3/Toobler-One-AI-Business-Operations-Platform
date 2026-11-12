import type { ModuleManifest } from '../kernel/module-system/define';
import auth from './core/auth/module';
import contacts from './core/contacts/module';
import health from './core/health/module';
import leads from './core/leads/module';
import tickets from './core/tickets/module';
import knowledge from './core/knowledge/module';
import offerings from './core/offerings/module';
import industries from './core/industries/module';
import accountModules from './core/module-switches/module';

// Every module in the product. Adding a module = one line here (see the plug-in-module skill).
export const modules: readonly ModuleManifest[] = [
  health,
  industries,
  accountModules,
  auth,
  contacts,
  leads,
  tickets,
  knowledge,
  offerings,
];
