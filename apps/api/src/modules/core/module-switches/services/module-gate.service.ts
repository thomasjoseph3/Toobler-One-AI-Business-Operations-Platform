import type { Database } from '../../../../kernel/database';
import type { ModuleGate, Registry } from '../../../../kernel/module-system/registry';
import { isModuleActive } from '../helpers/module-state';
import * as accountModulesRepository from '../repositories/account-modules.repository';

/**
 * The real module gate: answers "is this module on for this business?" for the guard, the event dispatcher and the job
 * runner. Core modules are always on. Any other module is on only when the business has it in its plan and switched on.
 * To save a trip to the database on every request, a business's answer is remembered for `cacheSeconds` (10 by default;
 * tests use 0). Changing a module calls `forget`, so a change counts at once on the server that made it.
 */
export function createModuleGate({
  registry,
  database,
  cacheSeconds = 10,
  readClock = () => Date.now(),
}: {
  registry: Registry;
  database: Database;
  cacheSeconds?: number;
  readClock?: () => number;
}): ModuleGate {
  const activeModuleIdsByBusiness = new Map<string, { activeModuleIds: Set<string>; validUntil: number }>();

  /** The ids of the modules that are on for the business, from memory when fresh, otherwise from the database. */
  async function findActiveModuleIds(accountId: string): Promise<Set<string>> {
    const remembered = activeModuleIdsByBusiness.get(accountId);
    if (remembered && remembered.validUntil > readClock()) return remembered.activeModuleIds;
    const storedModules = await database.runInAccountTransaction(accountId, (transaction) =>
      accountModulesRepository.listModules(transaction, accountId),
    );
    const activeModuleIds = new Set(
      storedModules.filter((stored) => isModuleActive(stored)).map((stored) => stored.moduleId),
    );
    if (cacheSeconds > 0) {
      activeModuleIdsByBusiness.set(accountId, { activeModuleIds, validUntil: readClock() + cacheSeconds * 1000 });
    }
    return activeModuleIds;
  }

  return {
    async isActive(accountId, moduleId) {
      if (registry.get(moduleId)?.kind === 'core') return true;
      return (await findActiveModuleIds(accountId)).has(moduleId);
    },
    forget(accountId) {
      activeModuleIdsByBusiness.delete(accountId);
    },
  };
}
