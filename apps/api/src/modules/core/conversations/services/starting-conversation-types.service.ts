import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';
import { listStartingConversationTypes } from '../helpers/default-conversation-types';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';

/**
 * Gives a business its starting types (the system types plus its industry's extras) when it has none yet. Safe to call
 * again and again: a business that already has types is left alone. Runs inside the business's own transaction.
 * Returns nothing.
 */
export async function ensureStartingConversationTypes(
  transaction: Db,
  options: { accountId: string; industryId: string },
): Promise<void> {
  const { accountId, industryId } = options;
  if ((await conversationTypesRepository.countConversationTypes(transaction, accountId)) > 0) return;

  const actor: Actor = { kind: 'system', id: null };
  const startingTypes = listStartingConversationTypes(industryId);
  const systemKeys = new Set(listStartingConversationTypes('general').map((type) => type.key));
  for (const [position, type] of startingTypes.entries()) {
    await conversationTypesRepository.insertConversationTypeIfKeyIsFree(transaction, {
      id: uuidv7(),
      accountId,
      key: type.key,
      label: type.label,
      description: type.description,
      examples: type.examples,
      isSystem: systemKeys.has(type.key),
      outcome: type.outcome,
      ticketType: type.ticketType ?? null,
      priority: type.priority ?? null,
      needsPerson: type.needsPerson,
      alert: type.alert,
      playbook: type.playbook,
      sort: position,
      actor,
    });
  }
}
