import type { Database } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import type { createAiService } from '../../ai';
import { findBusinessIdentity } from '../../auth';
import { createConversationRecordsService } from '../../conversations';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../helpers/agent-conversation-state';
import {
  buildSummaryPrompt,
  SUMMARY_PROMPT_VERSION,
  tidySummary,
  writeFallbackSummary,
} from '../helpers/build-summary-prompt';
import { findUnbackedAmounts } from '../helpers/check-amounts';
import * as conversationFactsRepository from '../repositories/conversation-facts.repository';
import { AGENT_ACTOR } from './agent-tool-log-unanswered-question.service';

/** The part of the AI service the summary needs (so a test or an eval can give a smaller one). */
export type SummaryAiService = Pick<ReturnType<typeof createAiService>, 'generateText'>;

/** What summarising gave. */
export interface ConversationSummaryResult {
  summary: string;
  summarisedAt: Date;
  /** False when the summary was written by code (nothing said, or the AI's own held an amount nobody gave). */
  writtenByAi: boolean;
}

/**
 * Writes the short summary of a conversation and saves it with what the agent learned. The AI writes the words from what was said; code
 * checks them (an amount nobody gave sends it to the plain version written from the saved facts). Built to be run as a background job when
 * a conversation ends, and safe to run again: it writes the summary again. If the AI cannot answer, nothing is changed and the error is
 * thrown, so the job is tried again.
 */
export function createConversationSummaryService(input: { database: Database; aiService: SummaryAiService }) {
  const { database, aiService } = input;
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /** Summarises one conversation of the business. 404 when it is unknown or another business's. */
    async summariseConversation(accountId: string, conversationId: string): Promise<ConversationSummaryResult> {
      const read = await conversationRecords.readMessagesForSummary(accountId, conversationId);
      if (!read) throw notFound('That conversation');

      const { identity, state } = await database.runInAccountTransaction(accountId, async (transaction) => ({
        identity: await findBusinessIdentity(transaction, accountId),
        state:
          (await conversationFactsRepository.findConversationState(transaction, accountId, conversationId)) ??
          EMPTY_AGENT_CONVERSATION_STATE,
      }));
      const lines = read.messages.map((message) => ({
        speaker: message.sender === 'customer' ? ('customer' as const) : ('agent' as const),
        text: message.body,
      }));
      const customerMessageCount = lines.filter((line) => line.speaker === 'customer').length;

      let summary = writeFallbackSummary({ customerMessageCount, state });
      let writtenByAi = false;
      if (customerMessageCount > 0) {
        const answer = await aiService.generateText({
          accountId,
          tag: {
            task: 'summarise',
            agentId: 'summariser',
            channel: read.channel,
            promptVersion: SUMMARY_PROMPT_VERSION,
            conversationId,
          },
          prompt: buildSummaryPrompt({ businessName: identity?.name ?? 'the business', lines, state }),
          temperature: 0.2,
          maxOutputTokens: 400,
        });
        const written = tidySummary(answer.text);
        // An amount nobody said (a total the AI worked out) is never kept: the plain version is used instead
        const sources = [
          ...lines.map((line) => line.text),
          ...Object.values(state.details),
          state.promise?.sentence ?? '',
        ];
        if (written !== '' && findUnbackedAmounts(written, sources).length === 0) {
          summary = written;
          writtenByAi = true;
        }
      }

      const summarisedAt = new Date();
      await database.runInAccountTransaction(accountId, (transaction) =>
        conversationFactsRepository.saveConversationSummary(transaction, {
          accountId,
          conversationId,
          summary,
          summarisedAt,
          actor: AGENT_ACTOR,
        }),
      );
      return { summary, summarisedAt, writtenByAi };
    },
  };
}
