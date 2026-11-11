import type { ModuleView } from '@toobler-one/shared';
import type { CatalogueEntry } from './module-catalogue';

// The rules for what state a module is in and what switching it does. Pure logic: no database, no clock, so every rule can
// be tested on its own.

/** What is stored for one module of one business. A module with no stored row is not in the business's plan. */
export interface StoredModule {
  moduleId: string;
  entitled: boolean;
  enabled: boolean;
}

/** Whether a module is on and working for a business: in the plan and switched on. */
export function isModuleActive(stored: StoredModule | undefined): boolean {
  return stored !== undefined && stored.entitled && stored.enabled;
}

/**
 * Describes every catalogue module for a business, in catalogue order. `isReady` says whether a channel is connected; it
 * is always true until the channels that need keys exist (WhatsApp, F25), and a switched-on module that is not ready shows
 * as `needs_connecting`.
 */
export function describeModules(
  catalogue: readonly CatalogueEntry[],
  storedModules: readonly StoredModule[],
  isReady: (moduleId: string) => boolean,
): ModuleView[] {
  return catalogue.map((entry) => {
    const stored = storedModules.find((candidate) => candidate.moduleId === entry.id);
    let state: ModuleView['state'] = 'not_in_plan';
    if (stored?.entitled) {
      if (!stored.enabled) state = 'off';
      else state = isReady(entry.id) ? 'active' : 'needs_connecting';
    }
    return {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      description: entry.description,
      requires: entry.requires,
      state,
    };
  });
}

/** Every module that needs this one, directly or through another: switching this one off must switch these off too. */
export function findModulesThatNeed(catalogue: readonly CatalogueEntry[], moduleId: string): string[] {
  const found: string[] = [];
  const toVisit = [moduleId];
  while (toVisit.length > 0) {
    const current = toVisit.pop()!;
    for (const entry of catalogue) {
      if (entry.requires.includes(current) && !found.includes(entry.id)) {
        found.push(entry.id);
        toVisit.push(entry.id);
      }
    }
  }
  return found;
}

/** What a request to switch a module would do, or why it cannot be done. */
export type SwitchPlan =
  | { allowed: true; moduleIdsToChange: string[] }
  | { allowed: false; reason: 'NOT_IN_PLAN' }
  | { allowed: false; reason: 'NEEDS_MODULE'; missingModuleId: string };

/**
 * Works out a switch request. Switching on needs the module to be in the plan and every module it requires to be active.
 * Switching off also switches off everything that needs it. Only modules whose state would actually change are listed, so
 * asking for what is already true changes nothing.
 */
export function planModuleSwitch(
  catalogue: readonly CatalogueEntry[],
  storedModules: readonly StoredModule[],
  moduleId: string,
  enabled: boolean,
): SwitchPlan {
  const entry = catalogue.find((candidate) => candidate.id === moduleId);
  const stored = storedModules.find((candidate) => candidate.moduleId === moduleId);
  if (!entry) throw new Error(`Module ${moduleId} is not in the catalogue.`); // the service checks first; this is a safety net

  if (enabled) {
    if (!stored?.entitled) return { allowed: false, reason: 'NOT_IN_PLAN' };
    const missingModuleId = entry.requires.find(
      (requiredId) => !isModuleActive(storedModules.find((candidate) => candidate.moduleId === requiredId)),
    );
    if (missingModuleId) return { allowed: false, reason: 'NEEDS_MODULE', missingModuleId };
    return { allowed: true, moduleIdsToChange: stored.enabled ? [] : [moduleId] };
  }

  const candidates = [moduleId, ...findModulesThatNeed(catalogue, moduleId)];
  const moduleIdsToChange = candidates.filter((candidateId) =>
    storedModules.some((candidate) => candidate.moduleId === candidateId && candidate.enabled),
  );
  return { allowed: true, moduleIdsToChange };
}
