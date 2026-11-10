import type { FastifyInstance } from 'fastify';
import type { EventHandlers } from '../events/events';
import type { JobDefinition } from '../jobs/jobs';

/**
 * Module kinds (docs/ARCHITECTURE.md): core is always on; engines, channels and features are switched on per business.
 */
export type ModuleKind = 'core' | 'engine' | 'channel' | 'feature';

export interface ModuleManifest {
  /** `<kind>.<name>`, e.g. `core.contacts`, `engine.leads`, `channel.whatsapp` */
  id: string;
  kind: ModuleKind;
  /** Modules whose public API (index.ts) this one uses. They must be active for this one to be active. */
  requires?: string[];
  /** Registers this module's routes. Mounted under /api/v1; every route declares `config.access`. */
  routes?: (app: FastifyInstance) => void | Promise<void>;
  /** Events this module reacts to (the module's handlers run only while the module is on for the business). */
  events?: EventHandlers;
  /** Background jobs this module owns, named `<module name>.<what>`. */
  jobs?: JobDefinition[];
}

/**
 * Declares a module. Returns the manifest exactly as given, but checked against ModuleManifest, so a mistake in a
 * manifest is a compile error. The kernel reads manifests; nothing else is registered by hand.
 */
export const defineModule = <SpecificManifest extends ModuleManifest>(manifest: SpecificManifest): SpecificManifest => manifest;
