import type { ModuleManifest } from '../kernel/module-system/define';
import auth from './core/auth/module';
import kernel from './core/kernel/module';

// Every module in the product. Adding a module = one line here (see the plug-in-module skill).
export const modules: readonly ModuleManifest[] = [kernel, auth];
