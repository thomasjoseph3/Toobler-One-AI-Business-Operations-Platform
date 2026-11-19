import type { ModulesResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import type { ModuleGate } from '../../../../kernel/module-system/registry';
import { findCatalogueEntry, MODULE_CATALOGUE } from '../helpers/module-catalogue';
import { describeModules, planModuleSwitch } from '../helpers/module-state';
import * as accountModulesRepository from '../repositories/account-modules.repository';
import { everyModuleIsReady, recordSwitch } from './modules.service';

// The database error code for "this row points at a business that does not exist".
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * What the Toobler team does with a business's plan: put a module in, or take it out. Only platform admins reach this (the
 * route's guard checks), and it works across businesses, so it runs on the owner connection and names the business in
 * every query. Repositories used: account-modules (in ../repositories).
 */
export function createPlatformModulesService({ database, moduleGate }: { database: Database; moduleGate: ModuleGate }) {
  return {
    /**
     * Puts a module into a business's plan (it stays off until the business switches it on) or takes it out (it is
     * switched off, and so is every module that needs it; the data is kept). Answers with that business's module list.
     * An unknown business is a 404.
     */
    async setEntitlement(
      principal: Pick<Principal, 'userId'>,
      businessId: string,
      moduleId: string,
      entitled: boolean,
    ): Promise<ModulesResponse> {
      if (!findCatalogueEntry(moduleId)) throw notFound('That module');
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        const storedModules = await database.runInSystemTransaction(async (transaction) => {
          const currentModules = await accountModulesRepository.listModulesForUpdate(transaction, businessId);
          const before = currentModules.find((stored) => stored.moduleId === moduleId);

          if (entitled) {
            await accountModulesRepository.setEntitlement(transaction, {
              accountId: businessId,
              moduleId,
              entitled: true,
              enabled: before?.enabled ?? false,
              actor,
            });
          } else {
            // Everything that is on and needs this module goes off with it
            const plan = planModuleSwitch(MODULE_CATALOGUE, currentModules, moduleId, false);
            const modulesSwitchedOff = plan.allowed ? plan.moduleIdsToChange : [];
            await accountModulesRepository.setEntitlement(transaction, {
              accountId: businessId,
              moduleId,
              entitled: false,
              enabled: false,
              actor,
            });
            const dependentModuleIds = modulesSwitchedOff.filter((switchedOffId) => switchedOffId !== moduleId);
            await accountModulesRepository.setModulesEnabled(transaction, businessId, dependentModuleIds, false, actor);
            for (const switchedOffId of modulesSwitchedOff) {
              await recordSwitch(transaction, businessId, actor, switchedOffId, false);
            }
          }

          if ((before?.entitled ?? false) !== entitled) {
            await writeActivityLog(transaction, {
              accountId: businessId,
              actor,
              kind: entitled ? 'modules.entitled' : 'modules.unentitled',
              details: { recordType: 'account', recordId: businessId, fields: [moduleId] },
            });
            await publishEvent(transaction, {
              accountId: businessId,
              eventName: entitled ? 'module.entitled' : 'module.unentitled',
              payload: { moduleId },
            });
          }
          return accountModulesRepository.listModules(transaction, businessId);
        });
        moduleGate.forget?.(businessId);
        return { items: describeModules(MODULE_CATALOGUE, storedModules, everyModuleIsReady) };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === FOREIGN_KEY_VIOLATION) {
          throw notFound('That business');
        }
        throw error;
      }
    },
  };
}

export type PlatformModulesService = ReturnType<typeof createPlatformModulesService>;
