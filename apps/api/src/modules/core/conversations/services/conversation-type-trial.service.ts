import type { TryConversationTypeRequest, TryConversationTypeResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import type { Principal } from '../../../../kernel/http/guard';
import { decide } from '../helpers/router';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import { createConversationClassifier } from './conversation-classifier.service';
import { ensureStartingConversationTypes } from './starting-conversation-types.service';

/** What "Try it" needs of the classifier. */
type Classifier = ReturnType<typeof createConversationClassifier>;

/**
 * "Try it": classify a pasted message with the business's own types and show what the router would do, without saving anything.
 * It makes one real AI call (so it counts towards the business's AI use).
 */
export function createConversationTypeTrialService({
  database,
  classifier,
}: {
  database: Database;
  classifier: Classifier;
}) {
  return {
    /**
     * Reads the business's switched-on types, asks the AI what the text was about, then runs the router on the answer as if the
     * person had no open lead or ticket. Nothing is stored (the text is never written anywhere by this route). A manager only (the
     * route checks). Answers with what the AI said and what would happen.
     */
    async tryConversationText(
      principal: Pick<Principal, 'accountId' | 'industryId'>,
      request: TryConversationTypeRequest,
    ): Promise<TryConversationTypeResponse> {
      const accountId = principal.accountId;

      // The types are read first and the transaction is closed before the (slow) AI call
      const types = await database.runInAccountTransaction(accountId, async (transaction) => {
        await ensureStartingConversationTypes(transaction, { accountId, industryId: principal.industryId });
        return conversationTypesRepository.listConversationTypes(transaction, accountId);
      });
      const activeTypes = types.filter((type) => type.isActive);
      const labelOf = (typeKey: string) => activeTypes.find((type) => type.key === typeKey)?.label ?? typeKey;

      const answer = await classifier.classifyConversation({
        accountId,
        channel: request.channel ?? 'webchat',
        types: activeTypes.map((type) => ({
          key: type.key,
          label: type.label,
          description: type.description,
          examples: type.examples,
        })),
        transcript: [{ speaker: 'customer', text: request.text }],
      });

      // The lead engine is a core module today, so a lead is always possible; there is no open lead or ticket in a trial
      const decision = decide(
        activeTypes,
        answer.classification,
        { openLead: null, openTicket: null },
        { leadsActive: true },
      );

      return {
        classification: {
          primary: {
            typeKey: answer.classification.primary.typeKey,
            label: labelOf(answer.classification.primary.typeKey),
            confidence: answer.classification.primary.confidence,
          },
          secondary: answer.classification.secondary.map((other) => ({
            typeKey: other.typeKey,
            label: labelOf(other.typeKey),
            confidence: other.confidence,
          })),
          needsPerson: answer.classification.needsPerson,
          reason: answer.reason,
        },
        decision: {
          primaryTypeKey: decision.primaryTypeKey,
          primaryLabel: labelOf(decision.primaryTypeKey),
          needsPerson: decision.needsPerson,
          aiUnsure: decision.aiUnsure,
          outcomes: decision.outcomes.map((outcome) => ({
            typeKey: outcome.typeKey,
            typeLabel: labelOf(outcome.typeKey),
            kind: outcome.kind,
            aiUnsure: outcome.aiUnsure,
            ticketType: outcome.ticket === null ? null : outcome.ticket.ticketType,
            priority: outcome.ticket === null ? null : outcome.ticket.priority,
            needsPerson: outcome.needsPerson,
            alert: outcome.alert,
            keepContact: outcome.keepContact,
            createCallbackTask: outcome.createCallbackTask,
          })),
        },
        servedBy: { provider: answer.servedBy.provider, modelName: answer.servedBy.modelName },
      };
    },
  };
}
