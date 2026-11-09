import type { ModuleKind, ModuleManifest } from './define';

export class RegistryError extends Error {}

export interface Registry {
  /** Every module, dependencies first. */
  readonly modules: readonly ModuleManifest[];
  get(id: string): ModuleManifest | undefined;
}

const MODULE_ID_PATTERN = /^(core|engine|channel|feature)\.[a-z][a-z0-9_]*$/;

/** Checks the set of modules is consistent (names, kinds, dependencies, no cycles) and orders it dependencies-first. */
export function createRegistry(moduleManifests: readonly ModuleManifest[]): Registry {
  const manifestsById = new Map<string, ModuleManifest>();
  for (const manifest of moduleManifests) {
    const kindFromId = manifest.id.split('.')[0];
    if (!MODULE_ID_PATTERN.test(manifest.id)) {
      throw new RegistryError(`Module id "${manifest.id}" must look like <kind>.<name> (core, engine, channel or feature).`);
    }
    if (kindFromId !== manifest.kind) {
      throw new RegistryError(`Module "${manifest.id}" says it is a ${manifest.kind}, but its id starts with "${kindFromId}".`);
    }
    if (manifestsById.has(manifest.id)) throw new RegistryError(`Module "${manifest.id}" is registered twice.`);
    manifestsById.set(manifest.id, manifest);
  }

  for (const manifest of manifestsById.values()) {
    for (const requiredModuleId of manifest.requires ?? []) {
      const requiredManifest = manifestsById.get(requiredModuleId);
      if (!requiredManifest) {
        throw new RegistryError(`Module "${manifest.id}" requires "${requiredModuleId}", which is not registered.`);
      }
      // Dependency arrows point inwards: core never depends on anything switchable (ARCHITECTURE.md "Dependency rules")
      if (manifest.kind === 'core' && (requiredManifest.kind as ModuleKind) !== 'core') {
        throw new RegistryError(
          `Core module "${manifest.id}" cannot require ${requiredManifest.kind} module "${requiredModuleId}": core never depends on engines, channels or features.`,
        );
      }
    }
  }

  // Put every module after the modules it requires, and detect modules that require each other in a circle.
  const manifestsDependenciesFirst: ModuleManifest[] = [];
  const visitStateByModuleId = new Map<string, 'visiting' | 'done'>();
  const visitModuleAfterItsDependencies = (manifest: ModuleManifest, pathSoFar: string[]) => {
    if (visitStateByModuleId.get(manifest.id) === 'done') return;
    if (visitStateByModuleId.get(manifest.id) === 'visiting') {
      throw new RegistryError(`Modules require each other in a circle: ${[...pathSoFar, manifest.id].join(' -> ')}.`);
    }
    visitStateByModuleId.set(manifest.id, 'visiting');
    for (const requiredModuleId of manifest.requires ?? []) {
      // The non-null "!" is safe: the loop above already threw if a required module was missing.
      visitModuleAfterItsDependencies(manifestsById.get(requiredModuleId)!, [...pathSoFar, manifest.id]);
    }
    visitStateByModuleId.set(manifest.id, 'done');
    manifestsDependenciesFirst.push(manifest);
  };
  for (const manifest of manifestsById.values()) visitModuleAfterItsDependencies(manifest, []);

  return { modules: manifestsDependenciesFirst, get: (moduleId) => manifestsById.get(moduleId) };
}

/**
 * Whether a module is on for a business. Three switches in the end (entitled by the plan, enabled by the manager, ready
 * when connected): that arrives with F03. Until then only core modules are on.
 */
export interface ModuleGate {
  isActive(accountId: string, moduleId: string): Promise<boolean>;
}

/** The temporary gate used until F03: a module is on for every business if it is a core module, otherwise off. */
export const coreOnlyGate = (registry: Registry): ModuleGate => ({
  isActive: async (_accountId, moduleId) => registry.get(moduleId)?.kind === 'core',
});
