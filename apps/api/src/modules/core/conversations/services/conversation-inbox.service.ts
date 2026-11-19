import type { InboxResponse, ListInboxQuery } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { findPeopleSummaries } from '../../auth';
import { findContactSummaries } from '../../contacts';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';
import { refuseOwnLeadsOnlyRole } from './conversation-reader.service';

/** Every business's holds that have run out go back to the AI: the job clears them and tells the live screens. Used by the scheduled job. */
const SYSTEM_ACTOR: Actor = { kind: 'system', id: 'conversations.release_expired_holds' };

/**
 * The inbox: every real conversation of the business, from every channel, needs-a-person first and then the newest activity first.
 * The routes call this. Repositories used: conversations, conversation-types (in ../repositories); names come from the contacts and auth modules' index files.
 */
export function createConversationInboxService({ database }: { database: Database }) {
  return {
    /** One page of the inbox, narrowed by channel, open/done, who holds it and "needs a person". 403 for the "own leads only" role. */
    async listInbox(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      query: ListInboxQuery,
    ): Promise<InboxResponse> {
      refuseOwnLeadsOnlyRole(principal);
      const { accountId } = principal;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const now = new Date();
        const { rows, total } = await conversationsRepository.listInbox(transaction, {
          accountId,
          filters: {
            channel: query.channel,
            status: query.status,
            held: query.held,
            needsPerson: query.needs_person === 'true',
            userId: principal.userId,
            now,
          },
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        const contacts = await findContactSummaries(transaction, {
          accountId,
          contactIds: rows.flatMap((row) => (row.contactId ? [row.contactId] : [])),
        });
        const holders = await findPeopleSummaries(transaction, {
          accountId,
          userIds: rows.flatMap((row) => (row.heldByUserId ? [row.heldByUserId] : [])),
        });
        const types = await conversationTypesRepository.listConversationTypes(transaction, accountId);
        return {
          total,
          page: query.page,
          limit: query.limit,
          items: rows.map((row) => {
            const contact = contacts.find((candidate) => candidate.id === row.contactId);
            const holdIsCurrent =
              row.heldByUserId !== null && row.heldUntil !== null && row.heldUntil.getTime() > now.getTime();
            const type = row.typeKey === null ? undefined : types.find((candidate) => candidate.key === row.typeKey);
            return {
              id: row.id,
              channel: row.channel,
              contact: contact ? { id: contact.id, name: contact.name } : null,
              fromPhone: row.fromPhoneKey === null ? null : `+${row.fromPhoneKey}`,
              fromEmail: row.fromEmail,
              preview: row.summary ?? row.firstWords,
              type: row.typeKey === null ? null : { key: row.typeKey, label: type?.label ?? row.typeKey },
              aiUnsure: row.aiUnsure,
              needsPerson: row.needsPerson,
              heldBy:
                holdIsCurrent && row.heldByUserId
                  ? {
                      userId: row.heldByUserId,
                      name: holders.find((holder) => holder.id === row.heldByUserId)?.name ?? null,
                    }
                  : null,
              doneAt: row.doneAt?.toISOString() ?? null,
              ended: row.endedAt !== null,
              lastActivityAt: row.lastActivityAt.toISOString(),
              createdAt: row.createdAt.toISOString(),
            };
          }),
        };
      });
    },

    /** The businesses that have a hold that ran out (ids only). For the scheduled job, which has no business of its own. */
    async findBusinessesWithExpiredHolds(): Promise<string[]> {
      return conversationsRepository.listAccountIdsWithExpiredHolds(database.system, new Date());
    },

    /**
     * One business: clears every hold that ran out, so the AI answers again, and tells the live screens. Safe to run twice. Answers how many
     * conversations went back to the AI.
     */
    async releaseExpiredHoldsOfBusiness(accountId: string): Promise<number> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const released = await conversationsRepository.releaseExpiredHolds(transaction, {
          accountId,
          now: new Date(),
          actor: SYSTEM_ACTOR,
        });
        for (const conversationId of released) {
          await publishEvent(transaction, {
            accountId,
            eventName: 'conversation.released',
            payload: { conversationId },
          });
        }
        return released.length;
      });
    },
  };
}
