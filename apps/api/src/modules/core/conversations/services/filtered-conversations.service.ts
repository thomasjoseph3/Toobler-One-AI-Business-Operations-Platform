import type {
  ConversationDetail,
  FilteredConversationsResponse,
  ListFilteredConversationsQuery,
} from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import * as conversationMessagesRepository from '../repositories/conversation-messages.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';
import { createConversationCorrectionService } from './conversation-correction.service';
import { refuseOwnLeadsOnlyRole } from './conversation-reader.service';

/** How much of the customer's first message the Filtered list shows. */
const FIRST_WORDS_MAX_CHARACTERS = 160;

/** The type a filtered conversation moves to when staff say it was a real enquiry: the business's "new enquiry" type if it is on, else its first lead type. */
const PREFERRED_ENQUIRY_TYPE_KEY = 'new_enquiry';

/**
 * The Filtered tab (F10): conversations that were filtered out (spam, wrong numbers, silent calls), and putting one back onto the board. They are
 * conversations, not leads: a filtered conversation has no contact and no lead until staff say it was a real enquiry.
 */
export function createFilteredConversationsService({ database }: { database: Database }) {
  const correctionService = createConversationCorrectionService({ database });

  return {
    /** One page of the filtered conversations, newest first. 403 for the "own leads only" role (a conversation has no owner yet). */
    async listFilteredConversations(
      principal: Pick<Principal, 'accountId' | 'role'>,
      query: ListFilteredConversationsQuery,
    ): Promise<FilteredConversationsResponse> {
      refuseOwnLeadsOnlyRole(principal);
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const { rows, total } = await conversationsRepository.listFilteredConversations(transaction, {
          accountId,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        const types = await conversationTypesRepository.listConversationTypes(transaction, accountId);
        const firstWords = await conversationMessagesRepository.findFirstCustomerWords(transaction, {
          accountId,
          conversationIds: rows.map((row) => row.id),
          maxCharacters: FIRST_WORDS_MAX_CHARACTERS,
        });
        return {
          items: rows.map((row) => ({
            id: row.id,
            channel: row.channel,
            fromPhone: row.fromPhoneKey === null ? null : `+${row.fromPhoneKey}`,
            fromEmail: row.fromEmail,
            // A type removed since shows by its key
            type: { key: row.typeKey, label: types.find((type) => type.key === row.typeKey)?.label ?? row.typeKey },
            reason: row.typeReason,
            firstWords: firstWords.get(row.id) ?? null,
            createdAt: row.createdAt.toISOString(),
          })),
          total,
          page: query.page,
          limit: query.limit,
        };
      });
    },

    /**
     * Puts a filtered conversation back onto the board: staff say it was a real enquiry. It is a type correction to the business's enquiry type, so the
     * contact and lead are made the usual way, and the correction is counted. 404 for an unknown conversation or another business's; 403 for the
     * "own leads only" role; 409 NOT_FILTERED when it is not in the Filtered list (it was already moved, or never filtered); 409 NO_ENQUIRY_TYPE when
     * the business has no switched-on type that makes leads. Answers with the conversation as it is now.
     */
    async unfilterConversation(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      conversationId: string,
    ): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(principal);
      const accountId = principal.accountId;
      const enquiryTypeKey = await database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation || conversation.isTest) throw notFound('That conversation');
        if (!(await conversationsRepository.isConversationFiltered(transaction, accountId, conversationId))) {
          throw conflict('NOT_FILTERED', 'This conversation is not in the Filtered list.');
        }
        const leadTypes = (await conversationTypesRepository.listConversationTypes(transaction, accountId)).filter(
          (type) => type.isActive && type.outcome === 'lead',
        );
        const chosen = leadTypes.find((type) => type.key === PREFERRED_ENQUIRY_TYPE_KEY) ?? leadTypes[0];
        if (!chosen) {
          throw conflict('NO_ENQUIRY_TYPE', 'Switch on a conversation type that makes leads first.');
        }
        return chosen.key;
      });
      return correctionService.setConversationType(principal, conversationId, { typeKey: enquiryTypeKey });
    },
  };
}
