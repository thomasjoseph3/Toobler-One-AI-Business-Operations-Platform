import type { ModuleManifest } from '../kernel/modules/define';
import kernel from './core/kernel/module';

// Every module in the product. Adding a module = one line here (see the plug-in-module skill).
export const modules: readonly ModuleManifest[] = [kernel];
