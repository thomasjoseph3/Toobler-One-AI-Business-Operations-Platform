import type { ConversationDetail } from '@toobler-one/shared';
import type { Database, Db } from '../../../../kernel/database';
import { forbidden, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { findContactSummaries } from '../../contacts';
import * as conversationMessagesRepository from '../repositories/conversation-messages.repository';
import * as conversationOutcomesRepository from '../repositories/conversation-outcomes.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';

/**
 * Conversations hold what customers wrote, to people who may belong to anyone's leads. The "own leads only" role sees only the leads it
 * owns, and a conversation has no owner yet (who sees which conversation is decided with the inbox, F21 and F02), so for now that role cannot read or
 * correct conversations at all. Managers and staff can. Throws 403 for the "own leads only" role.
 */
export function refuseOwnLeadsOnlyRole(principal: Pick<Principal, 'role'>): void {
  if (principal.role === 'staff_own') throw forbidden('Your role cannot read conversations yet.');
}

/**
 * One conversation with its messages and what it led to, as staff see it. Runs in the caller's transaction (so a correction can answer with
 * what it just saved). 404 when the conversation is unknown or another business's.
 */
export async function readConversationDetail(
  transaction: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
  if (!conversation) throw notFound('That conversation');
  const messages = await conversationMessagesRepository.listMessagesOfConversation(
    transaction,
    accountId,
    conversationId,
  );
  const outcomes = await conversationOutcomesRepository.listOutcomesOfConversation(
    transaction,
    accountId,
    conversationId,
  );
  const types = await conversationTypesRepository.listConversationTypes(transaction, accountId);
  // The business's own word for a type; a type that was removed since shows by its key
  const labelOf = (typeKey: string) => types.find((type) => type.key === typeKey)?.label ?? typeKey;

  const contacts =
    conversation.contactId === null
      ? []
      : await findContactSummaries(transaction, { accountId, contactIds: [conversation.contactId] });
  const contact = contacts[0];

  return {
    id: conversation.id,
    channel: conversation.channel,
    fromPhone: conversation.fromPhoneKey === null ? null : `+${conversation.fromPhoneKey}`,
    fromEmail: conversation.fromEmail,
    contact: contact ? { id: contact.id, name: contact.name, phone: contact.phone, email: contact.email } : null,
    status: conversation.status,
    type:
      conversation.status === 'sorted' && conversation.typeKey !== null && conversation.typeSource !== null
        ? {
            key: conversation.typeKey,
            label: labelOf(conversation.typeKey),
            confidence: conversation.typeConfidence ?? 0,
            source: conversation.typeSource,
            reason: conversation.typeReason,
            aiUnsure: conversation.aiUnsure,
          }
        : null,
    needsPerson: conversation.needsPerson,
    endedAt: conversation.endedAt?.toISOString() ?? null,
    sortedAt: conversation.sortedAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    messages: messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
    outcomes: outcomes.map((outcome) => ({
      typeKey: outcome.typeKey,
      typeLabel: labelOf(outcome.typeKey),
      kind: outcome.kind,
      confidence: outcome.confidence,
      aiUnsure: outcome.aiUnsure,
      leadId: outcome.leadId,
      ticketId: outcome.ticketId,
      carriedOut: outcome.appliedAt !== null,
      isCurrent: outcome.supersededAt === null,
    })),
  };
}

/** Reading a conversation. The routes call this. */
export function createConversationReaderService({ database }: { database: Database }) {
  return {
    /** One conversation with its messages and what it led to. 404 when it is unknown or another business's; 403 for the "own leads only" role. */
    async getConversation(
      principal: Pick<Principal, 'accountId' | 'role'>,
      conversationId: string,
    ): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(principal);
      return database.runInAccountTransaction(principal.accountId, (transaction) =>
        readConversationDetail(transaction, principal.accountId, conversationId),
      );
    },
  };
}
