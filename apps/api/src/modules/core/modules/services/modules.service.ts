import type { ModulesResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Db, Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { findCatalogueEntry, MODULE_CATALOGUE, STARTING_MODULE_IDS } from '../helpers/module-catalogue';
import { describeModules, planModuleSwitch } from '../helpers/module-state';
import * as accountModulesRepository from '../repositories/account-modules.repository';

// Until the channels that need keys exist (WhatsApp, F25), every channel counts as ready.
const everyModuleIsReady = () => true;

/**
 * Everything about a business's modules: listing them and switching them on or off. The routes call this.
 * Repositories used: account-modules (in ../repositories).
 */
export function createModulesService({ database }: { database: Database }) {
  return {
    /** Every catalogue module with its state for the business: active, off, not in the plan or needs connecting. */
    async listModules(principal: Pick<Principal, 'accountId'>): Promise<ModulesResponse> {
      const storedModules = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        accountModulesRepository.listModules(transaction),
      );
      return { items: describeModules(MODULE_CATALOGUE, storedModules, everyModuleIsReady) };
    },

    /**
     * Switches a module on or off for the manager's business and answers with the updated list. Switching on needs the
     * module in the plan and the modules it requires active; switching off also switches off what needs it. The data of a
     * module that is off is kept.
     */
    async switchModule(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      moduleId: string,
      enabled: boolean,
    ): Promise<ModulesResponse> {
      if (!findCatalogueEntry(moduleId)) throw notFound('That module');
      const actor = { kind: 'user', id: principal.userId } as const;

      const storedModules = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const currentModules = await accountModulesRepository.listModulesForUpdate(transaction);
        const plan = planModuleSwitch(MODULE_CATALOGUE, currentModules, moduleId, enabled);
        if (!plan.allowed && plan.reason === 'NOT_IN_PLAN') {
          throw conflict('NOT_IN_PLAN', 'This is not in your plan. Contact Toobler to add it.');
        }
        if (!plan.allowed && plan.reason === 'NEEDS_MODULE') {
          throw conflict('NEEDS_MODULE', 'Switch on the module this one needs first.', {
            moduleId: plan.missingModuleId,
          });
        }
        if (plan.allowed) {
          await accountModulesRepository.setModulesEnabled(transaction, plan.moduleIdsToChange, enabled, actor);
          for (const changedModuleId of plan.moduleIdsToChange) {
            await recordSwitch(transaction, principal.accountId, actor, changedModuleId, enabled);
          }
        }
        return accountModulesRepository.listModules(transaction);
      });
      return { items: describeModules(MODULE_CATALOGUE, storedModules, everyModuleIsReady) };
    },
  };
}

export type ModulesService = ReturnType<typeof createModulesService>;

/** Writes the activity-log line and the event for one module that was switched on or off. */
async function recordSwitch(
  transaction: Db,
  accountId: string,
  actor: { kind: 'user'; id: string },
  moduleId: string,
  enabled: boolean,
): Promise<void> {
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: enabled ? 'modules.enabled' : 'modules.disabled',
    // The log's record id is a uuid, so the business is the record and the module's id goes in `fields`
    details: { recordType: 'account', recordId: accountId, fields: [moduleId] },
  });
  await publishEvent(transaction, {
    accountId,
    eventName: enabled ? 'module.enabled' : 'module.disabled',
    payload: { moduleId },
  });
}

/**
 * Gives a brand-new business its starting modules (in the plan and switched on). Called by sign-up inside its own
 * transaction, on the owner connection, because the app role may not add modules to a plan.
 */
export async function grantStartingModules(transaction: Db, accountId: string, userId: string): Promise<void> {
  for (const moduleId of STARTING_MODULE_IDS) {
    await accountModulesRepository.insertModule(transaction, {
      accountId,
      moduleId,
      entitled: true,
      enabled: true,
      actor: { kind: 'user', id: userId },
    });
  }
}
