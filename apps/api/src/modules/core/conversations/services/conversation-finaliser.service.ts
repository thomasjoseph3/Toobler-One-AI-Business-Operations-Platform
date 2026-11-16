import type { ConversationOutcome } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import { findBusinessIndustry, findStaffContactPoints } from '../../auth';
import type { TranscriptLine } from '../helpers/classifier-prompt';
import { preFilter, type PreFilterInput } from '../helpers/pre-filter';
import { decide, type RoutableConversationType, type TypeClassification } from '../helpers/router';
import * as blockListRepository from '../repositories/block-list.repository';
import * as conversationMessagesRepository from '../repositories/conversation-messages.repository';
import * as conversationOutcomesRepository from '../repositories/conversation-outcomes.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import * as conversationsRepository from '../repositories/conversations.repository';
import type { ConversationRow } from '../repositories/conversations.repository';
import { createConversationClassifier } from './conversation-classifier.service';
import { ensureStartingConversationTypes } from './starting-conversation-types.service';

type Classifier = ReturnType<typeof createConversationClassifier>;

/** Facts only the channel knows, passed when it asks for the sorting. None of this is stored. */
export interface FinaliseOptions {
  /** Phone: how long the call lasted, and whether the caller said anything. */
  callDurationSeconds?: number;
  callerSpoke?: boolean;
  /** Email: the message's headers (to tell machine-made mail from a person's). */
  emailHeaders?: Readonly<Record<string, string>>;
  /** Sort again even though it is already sorted (a staff correction passes this). */
  force?: boolean;
}

/** What sorting a conversation decided. */
export interface FinaliseResult {
  conversationId: string;
  /** `already_sorted` when it was sorted before and nothing was done. */
  result: 'sorted' | 'already_sorted';
  typeKey: string;
  typeSource: 'rule' | 'ai_final' | 'staff';
  aiUnsure: boolean;
  needsPerson: boolean;
  outcomes: Array<{ typeKey: string; kind: ConversationOutcome; aiUnsure: boolean }>;
}

/** The decision made without asking the AI, when a rule or an empty conversation settles it. */
interface DecidedClassification {
  classification: TypeClassification;
  source: 'rule' | 'ai_final';
  reason: string | null;
  actor: Actor;
}

/** What was read from the database before the (slow) AI call. */
interface GatheredConversation {
  conversation: ConversationRow;
  types: RoutableConversationType[];
  typeDetails: Array<{ key: string; label: string; description: string; examples: string[] }>;
  transcript: TranscriptLine[];
  customerMessageCount: number;
  preFilterSets: Pick<PreFilterInput, 'blockedPhoneKeys' | 'blockedEmails' | 'staffPhoneKeys' | 'staffEmails'>;
}

/** The result for a conversation that was sorted earlier: read from what was stored. */
async function describeSortedConversation(
  database: Database,
  accountId: string,
  conversation: ConversationRow,
): Promise<FinaliseResult> {
  const outcomes = await database.runInAccountTransaction(accountId, (transaction) =>
    conversationOutcomesRepository.listOutcomesOfConversation(transaction, accountId, conversation.id),
  );
  return {
    conversationId: conversation.id,
    result: 'already_sorted',
    typeKey: conversation.typeKey ?? 'unclear',
    typeSource: conversation.typeSource ?? 'ai_final',
    aiUnsure: conversation.aiUnsure,
    needsPerson: conversation.needsPerson,
    outcomes: outcomes
      .filter((outcome) => outcome.supersededAt === null)
      .map((outcome) => ({ typeKey: outcome.typeKey, kind: outcome.kind, aiUnsure: outcome.aiUnsure })),
  };
}

/**
 * Sorts a conversation once it has ended (docs/CONVERSATION-TYPES.md steps 0, 3 and 4): the rules in code first, then (only when no rule
 * settles it) the AI reads the whole conversation and names its type, then the router turns that into outcomes, which are saved.
 * This slice records the type and the outcomes; creating the lead or ticket an outcome asks for is the next slice.
 *
 * Built to be run as a background job and safe to run twice: the database is read, closed, then the AI is asked (never holding a
 * transaction open during the slow call), then everything is written in one transaction under a row lock. A conversation that is
 * already sorted is left alone. If the AI cannot answer, nothing is changed and the error is thrown so the job is tried again.
 */
export function createConversationFinaliser({ database, classifier }: { database: Database; classifier: Classifier }) {
  /** Reads everything the sorting needs and notes that the conversation ended. Returns the conversation itself when it is already sorted. */
  async function gather(
    accountId: string,
    conversationId: string,
    options: FinaliseOptions,
  ): Promise<{ sorted: ConversationRow } | { gathered: GatheredConversation }> {
    return database.runInAccountTransaction(accountId, async (transaction) => {
      const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
      if (!conversation) throw notFound('That conversation');
      if (conversation.status === 'sorted' && options.force !== true) return { sorted: conversation };

      // A business that never opened its list of types is given them now, for its kind of business
      const industryId = (await findBusinessIndustry(transaction, accountId)) ?? 'general';
      await ensureStartingConversationTypes(transaction, { accountId, industryId });
      const types = (await conversationTypesRepository.listConversationTypes(transaction, accountId)).filter(
        (type) => type.isActive,
      );
      const messages = await conversationMessagesRepository.listMessagesOfConversation(
        transaction,
        accountId,
        conversationId,
      );
      const blockRows = await blockListRepository.listBlockListRows(transaction, accountId);
      const staff = await findStaffContactPoints(transaction, accountId);
      await conversationsRepository.markConversationEnded(transaction, {
        accountId,
        conversationId,
        endedAt: new Date(),
        actor: { kind: 'system', id: 'core.conversations' },
      });

      const transcript: TranscriptLine[] = messages
        .filter((message) => message.sender !== 'system')
        .map((message) => ({
          speaker: message.sender === 'customer' ? 'customer' : 'business',
          text: message.body,
        }));
      return {
        gathered: {
          conversation,
          types,
          typeDetails: types.map((type) => ({
            key: type.key,
            label: type.label,
            description: type.description,
            examples: type.examples,
          })),
          transcript,
          customerMessageCount: messages.filter((message) => message.sender === 'customer').length,
          preFilterSets: {
            blockedPhoneKeys: new Set(blockRows.flatMap((row) => (row.phoneKey === null ? [] : [row.phoneKey]))),
            blockedEmails: new Set(blockRows.flatMap((row) => (row.email === null ? [] : [row.email]))),
            staffPhoneKeys: staff.phoneKeys,
            staffEmails: staff.emails,
          },
        },
      };
    });
  }

  /** The decision when a rule or an empty conversation settles it, or null when the AI must be asked. */
  function decideWithoutAi(gathered: GatheredConversation, options: FinaliseOptions): DecidedClassification | null {
    const { conversation } = gathered;
    const ruleActor: Actor = { kind: 'system', id: 'pre-filter' };
    const matched = preFilter({
      channel: conversation.channel,
      ...(options.callDurationSeconds !== undefined ? { callDurationSeconds: options.callDurationSeconds } : {}),
      ...(options.callerSpoke !== undefined ? { callerSpoke: options.callerSpoke } : {}),
      conversationEnded: true,
      customerMessageCount: gathered.customerMessageCount,
      ...(options.emailHeaders !== undefined ? { emailHeaders: options.emailHeaders } : {}),
      phoneKey: conversation.fromPhoneKey ?? undefined,
      email: conversation.fromEmail ?? undefined,
      ...gathered.preFilterSets,
    });
    if (matched) {
      return {
        classification: { primary: { typeKey: matched.typeKey, confidence: 1 }, secondary: [], needsPerson: false },
        source: 'rule',
        reason: matched.reason,
        actor: ruleActor,
      };
    }
    // Nothing from the customer to read: there is nothing for the AI to sort
    if (gathered.customerMessageCount === 0) {
      return {
        classification: { primary: { typeKey: 'no_conversation', confidence: 1 }, secondary: [], needsPerson: false },
        source: 'rule',
        reason: 'nothing_said',
        actor: ruleActor,
      };
    }
    return null;
  }

  return {
    /**
     * Sorts the conversation (see above). 404 when it is unknown or another business's. Answers with what was decided, or with what
     * was decided earlier when it was already sorted.
     */
    async finaliseConversation(
      accountId: string,
      conversationId: string,
      options: FinaliseOptions = {},
    ): Promise<FinaliseResult> {
      const read = await gather(accountId, conversationId, options);
      if ('sorted' in read) return describeSortedConversation(database, accountId, read.sorted);
      const { gathered } = read;

      // The AI is asked with no transaction open. If it cannot answer, this throws and nothing is changed.
      let decided = decideWithoutAi(gathered, options);
      if (decided === null) {
        const answer = await classifier.classifyConversation({
          accountId,
          channel: gathered.conversation.channel,
          conversationId,
          types: gathered.typeDetails,
          transcript: gathered.transcript,
          ...(gathered.conversation.contactId !== null ? { facts: { isExistingContact: true } } : {}),
        });
        decided = {
          classification: answer.classification,
          source: 'ai_final',
          reason: answer.reason,
          actor: { kind: 'agent', id: 'classifier' },
        };
      }
      const { classification, source, reason, actor } = decided;

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Two sortings at the same moment take turns here: the second finds it already sorted
        const locked = await conversationsRepository.lockConversationById(transaction, accountId, conversationId);
        if (!locked) throw notFound('That conversation');
        if (locked.status === 'sorted' && options.force !== true) {
          return describeSortedConversation(database, accountId, locked);
        }

        // The decision (no open lead or ticket is known yet; the next slice adds them). A lead is always possible: that module is core.
        const decision = decide(
          gathered.types,
          classification,
          { openLead: null, openTicket: null },
          { leadsActive: true },
        );
        const sortedAt = new Date();
        await conversationsRepository.saveSortedConversation(transaction, {
          accountId,
          conversationId,
          sorted: {
            typeKey: decision.primaryTypeKey,
            typeConfidence: Math.min(1, Math.max(0, classification.primary.confidence)),
            typeSource: source,
            typeReason: reason,
            aiUnsure: decision.aiUnsure,
            needsPerson: decision.needsPerson,
            sortedAt,
            actor,
          },
        });
        for (const outcome of decision.outcomes) {
          await conversationOutcomesRepository.upsertOutcome(transaction, {
            id: uuidv7(),
            accountId,
            conversationId,
            typeKey: outcome.typeKey,
            kind: outcome.kind,
            confidence: outcome.confidence,
            aiUnsure: outcome.aiUnsure,
          });
        }
        // Sorting again (a correction) leaves out what no longer applies
        await conversationOutcomesRepository.supersedeOutcomesExceptTypes(transaction, {
          accountId,
          conversationId,
          typeKeysToKeep: decision.outcomes.map((outcome) => outcome.typeKey),
          at: sortedAt,
        });

        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'conversations.sorted',
          // Which conversation, never what was said
          details: { recordType: 'conversation', recordId: conversationId, fields: ['type'] },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'conversation.sorted',
          payload: {
            conversationId,
            typeKey: decision.primaryTypeKey,
            typeSource: source,
            outcomeKinds: decision.outcomes.map((outcome) => outcome.kind),
            needsPerson: decision.needsPerson,
          },
        });

        return {
          conversationId,
          result: 'sorted' as const,
          typeKey: decision.primaryTypeKey,
          typeSource: source,
          aiUnsure: decision.aiUnsure,
          needsPerson: decision.needsPerson,
          outcomes: decision.outcomes.map((outcome) => ({
            typeKey: outcome.typeKey,
            kind: outcome.kind,
            aiUnsure: outcome.aiUnsure,
          })),
        };
      });
    },
  };
}
