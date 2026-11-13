import type { AssignmentRules, ReplaceAssignmentRulesRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { pickNextPerson } from '../helpers/round-robin';
import * as assignmentRulesRepository from '../repositories/assignment-rules.repository';

// The database error code for "a foreign key points at nothing" (here: a person who does not work for the business).
const FOREIGN_KEY_VIOLATION = '23503';

/** Reads the rule and its people as the API shows them. */
async function readAssignmentRules(transaction: Db, accountId: string): Promise<AssignmentRules> {
  const rule = await assignmentRulesRepository.findAssignmentRule(transaction, accountId);
  if (!rule) throw notFound('The sharing-out rule');
  const roundRobinUserIds = await assignmentRulesRepository.listRoundRobinUserIds(transaction, accountId);
  // For sharing out by offering the stored person is the fallback, not "the one person"
  return {
    mode: rule.mode,
    userId: rule.mode === 'one_person' ? rule.userId : null,
    fallbackUserId: rule.mode === 'by_offering' ? rule.userId : null,
    roundRobinUserIds,
  };
}

/**
 * Picks who owns a new lead according to the business's rule: the one person, the person who looks after the lead's offering (or the
 * fallback person when the lead names no offering or nobody looks after it), or the next person in the round-robin turn (and
 * remembers who it was). Call it inside the transaction that adds the lead. The rule row is locked until the transaction ends, so
 * leads added at the same moment get different people in turn. Returns null when nobody can be picked.
 * `offeringOwnerUserId` is who looks after the offering the lead is about (null when it names none, or nobody looks after it).
 */
export async function chooseOwnerForNewLead(
  transaction: Db,
  options: { accountId: string; actor: Actor; offeringOwnerUserId?: string | null },
): Promise<string | null> {
  const rule = await assignmentRulesRepository.lockAssignmentRule(transaction, options.accountId);
  if (!rule) return null;
  if (rule.mode === 'one_person') return rule.userId;
  if (rule.mode === 'by_offering') return options.offeringOwnerUserId ?? rule.userId;

  const userIds = await assignmentRulesRepository.listRoundRobinUserIds(transaction, options.accountId);
  const nextUserId = pickNextPerson({ userIds, lastAssignedUserId: rule.lastAssignedUserId });
  if (nextUserId !== null) {
    await assignmentRulesRepository.setLastAssignedUser(transaction, {
      accountId: options.accountId,
      userId: nextUserId,
      actor: options.actor,
    });
  }
  return nextUserId;
}

/**
 * Everything about how a business shares out new leads. The routes call this.
 * Repositories used: assignment-rules (in ../repositories).
 */
export function createAssignmentRulesService({ database }: { database: Database }) {
  return {
    /** How new leads are shared out now. */
    async getAssignmentRules(principal: Pick<Principal, 'accountId'>): Promise<AssignmentRules> {
      return database.runInAccountTransaction(principal.accountId, (transaction) =>
        readAssignmentRules(transaction, principal.accountId),
      );
    },

    /**
     * Changes the rule: every new lead goes to one person, the listed people take turns, or a lead goes to the person who looks after
     * its offering (with one fallback person). Every person must work for the
     * business (404 otherwise; the database checks it). A new round-robin starts from its first person. Answers with the new
     * rule.
     */
    async replaceAssignmentRules(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: ReplaceAssignmentRulesRequest,
    ): Promise<AssignmentRules> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Locked, so a lead added at this moment sees either the old rule or the new one, never half of each
          if (!(await assignmentRulesRepository.lockAssignmentRule(transaction, accountId))) {
            throw notFound('The sharing-out rule');
          }
          const roundRobinUserIds = request.mode === 'round_robin' ? request.userIds : [];
          // The one person, or for sharing out by offering the fallback person, is kept in the rule's person column
          const personOfTheRule =
            request.mode === 'one_person'
              ? request.userId
              : request.mode === 'by_offering'
                ? request.fallbackUserId
                : null;
          // The people go in first: if one does not work for the business, nothing else is saved
          await assignmentRulesRepository.replaceRoundRobinUserIds(transaction, {
            accountId,
            userIds: roundRobinUserIds,
            actor,
          });
          await assignmentRulesRepository.updateAssignmentRule(transaction, {
            accountId,
            mode: request.mode,
            userId: personOfTheRule,
            lastAssignedUserId: null,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'assignment_rules.replaced',
            details: {
              recordType: 'assignment_rules',
              fields:
                request.mode === 'one_person'
                  ? ['mode', 'userId']
                  : request.mode === 'by_offering'
                    ? ['mode', 'fallbackUserId']
                    : ['mode', 'userIds'],
            },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'assignment_rules.changed',
            payload: { mode: request.mode },
          });
          return readAssignmentRules(transaction, accountId);
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === FOREIGN_KEY_VIOLATION) {
          throw notFound('That person');
        }
        throw error;
      }
    },
  };
}

export type AssignmentRulesService = ReturnType<typeof createAssignmentRulesService>;
