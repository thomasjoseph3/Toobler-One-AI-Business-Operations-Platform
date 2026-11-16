import type { ConversationChannel } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { AgentToolContext, AgentToolDefinition } from '../../../../kernel/module-system/define';
import type { LlmCallDetails, LlmPrompt, LlmToolCallRecord } from '../../../../providers/llm';
import type { createAiService } from '../../ai';
import { findBusinessIdentity } from '../../auth';
import {
  createKnowledgeSearchService,
  createUnansweredQuestionsService,
  findBusinessKnowledgeForTheAgent,
} from '../../knowledge';
import { findWhatTheAgentMaySee } from '../../offerings';
import type { AgentConversationState } from '../helpers/agent-conversation-state';
import type { AgentTurnData, StateHolder } from '../helpers/agent-turn-data';
import {
  AGENT_PROMPT_VERSION,
  buildAgentPrompt,
  describeBusinessFacts,
  describeOffers,
  describeSituations,
  describeWhatWeSell,
} from '../helpers/build-agent-prompt';
import { describeAmountCorrection, findUnbackedAmounts, UNCONFIRMED_AMOUNT_REPLY } from '../helpers/check-amounts';
import { isOpenAt } from '../helpers/opening-hours';
import { makeGetBusinessInfoTool } from './agent-tool-get-business-info.service';
import { makeListOfferingsTool } from './agent-tool-list-offerings.service';
import { makeLogUnansweredQuestionTool } from './agent-tool-log-unanswered-question.service';
import { makeRequestHumanCallbackTool } from './agent-tool-request-human-callback.service';
import { makeSaveDetailsTool } from './agent-tool-save-details.service';
import { makeSearchKnowledgeTool } from './agent-tool-search-knowledge.service';

type AiService = ReturnType<typeof createAiService>;

/** Said when the model kept asking for tools and never answered. */
export const COULD_NOT_WORK_IT_OUT_REPLY = "Sorry, I couldn't work that out. Could you say it another way?";

/** How many of the tools' latest results are kept in the state, for the amount check on later messages. */
const EARLIER_TOOL_RESULTS_KEPT = 20;

/** What one turn needs. The business, the conversation and the channel come from the server, never from the customer's words. */
export interface AgentTurnInput {
  accountId: string;
  conversationId: string | null;
  channel: ConversationChannel;
  /** What the channel says about itself, put into the prompt (the agent never names a channel). */
  channelNote?: string;
  /** The conversation so far, ending with the customer's new message. */
  messages: LlmPrompt['messages'];
  /** What the agent remembers from earlier turns. */
  state: AgentConversationState;
}

/** What one turn gives back. */
export interface AgentTurnResult {
  /** What to say to the customer. */
  reply: string;
  /** What to remember for the next turn. */
  state: AgentConversationState;
  /** Every tool the model asked for, and what it answered (for "Test the agent" and the log). */
  toolCalls: LlmToolCallRecord[];
  /** Amounts the model said that nobody confirmed, and that were held back (empty most of the time). */
  heldBackAmounts: number[];
  /** All the AI calls of this turn together, or null when the model never answered. */
  details: LlmCallDetails | null;
  /** True when the model failed after a tool had already acted, and the reply was written by the code instead. */
  modelFailedAfterActing: boolean;
}

export interface AgentRuntimeDependencies {
  database: Database;
  aiService: AiService;
  /** The tools the other modules add (WhatsApp's "send details" and so on), only for modules that are on for the business. */
  findExtraTools?: (context: AgentToolContext) => Promise<AgentToolDefinition[]>;
  /** The time, so tests can fix it. */
  now?: () => Date;
}

/**
 * The agent for text conversations. It does one turn at a time: read what it may know, build the tools for this business and
 * conversation, let the model answer (using the tools), check the answer for amounts nobody confirmed, and give back the reply with
 * what to remember. It does not store anything and knows no channel: the caller keeps the state and the messages.
 */
export function createAgentRuntime(dependencies: AgentRuntimeDependencies) {
  const { database, aiService } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const knowledgeSearch = createKnowledgeSearchService({ database });
  const unansweredQuestions = createUnansweredQuestionsService({ database });

  /** Reads everything the agent may know about the business, in one go. */
  async function readTurnData(accountId: string): Promise<AgentTurnData> {
    const moment = now();
    return database.runInAccountTransaction(accountId, async (transaction) => {
      const identity = await findBusinessIdentity(transaction, accountId);
      if (!identity) throw new ApiError(404, 'NOT_FOUND', 'That business does not exist.');
      return {
        businessName: identity.name,
        timeZone: identity.timeZone,
        knowledge: await findBusinessKnowledgeForTheAgent(transaction, { accountId, industryId: identity.industry }),
        whatWeSell: await findWhatTheAgentMaySee(transaction, {
          accountId,
          timeZone: identity.timeZone,
          now: moment,
        }),
        now: moment,
      };
    });
  }

  return {
    /** Runs one turn: the customer's new message in, the reply and the new state out. */
    async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
      const data = await readTurnData(input.accountId);
      const holder: StateHolder = { current: input.state };
      const tag = {
        task: 'chat_reply',
        agentId: 'text-agent',
        channel: input.channel,
        promptVersion: AGENT_PROMPT_VERSION,
        conversationId: input.conversationId,
      };

      const prompt = buildAgentPrompt(
        {
          businessName: data.businessName,
          knowledge: data.knowledge,
          whatWeSell: data.whatWeSell,
          now: data.now,
          timeZone: data.timeZone,
          isOpenNow: isOpenAt(data.knowledge.weeklyHours, data.now, data.timeZone),
          detailsSoFar: input.state.details,
          channelNote: input.channelNote,
        },
        input.messages,
      );

      const ownTools = [
        makeGetBusinessInfoTool(data),
        makeListOfferingsTool(data),
        makeSearchKnowledgeTool({ accountId: input.accountId, knowledgeSearch }),
        makeLogUnansweredQuestionTool({ accountId: input.accountId, unansweredQuestions }),
        makeSaveDetailsTool({ data, holder }),
        makeRequestHumanCallbackTool({ data, holder }),
      ];
      const extraTools = dependencies.findExtraTools
        ? await dependencies.findExtraTools({
            accountId: input.accountId,
            conversationId: input.conversationId,
            channel: input.channel,
          })
        : [];

      let answer;
      try {
        answer = await aiService.generateWithTools({
          accountId: input.accountId,
          tag,
          prompt,
          tools: [...ownTools, ...extraTools],
          temperature: 0.3,
        });
      } catch (error) {
        // The model failed after a tool already acted (the promise was made): the customer is told what went through, not shown an error
        const promiseMadeThisTurn = holder.current.promise !== null && input.state.promise === null;
        if (error instanceof ApiError && promiseMadeThisTurn && holder.current.promise) {
          return {
            reply: `Sorry, my reply was cut off, but I have noted your details. ${holder.current.promise.sentence}`,
            state: holder.current,
            toolCalls: [],
            heldBackAmounts: [],
            details: null,
            modelFailedAfterActing: true,
          };
        }
        throw error;
      }

      // The state keeps what the tools gave back, so a price a tool gave a few messages ago may be repeated later
      const toolResults = answer.toolCalls.filter((call) => call.ok).map((call) => call.result);
      const stateAfterTurn: AgentConversationState = {
        ...holder.current,
        earlierToolResults: [...input.state.earlierToolResults, ...toolResults].slice(-EARLIER_TOOL_RESULTS_KEPT),
      };

      if (answer.hitRoundLimit || answer.text.trim() === '') {
        return {
          reply: COULD_NOT_WORK_IT_OUT_REPLY,
          state: stateAfterTurn,
          toolCalls: answer.toolCalls,
          heldBackAmounts: [],
          details: answer.details,
          modelFailedAfterActing: false,
        };
      }

      // "The AI states facts; code decides": an amount nobody gave (a total the model worked out) never reaches the customer
      const sources = [
        ...input.messages.filter((message) => message.role === 'user').map((message) => message.text),
        ...stateAfterTurn.earlierToolResults,
        ...Object.values(stateAfterTurn.details),
        // What the business told the agent: its facts and prices (not the rules, which have numbers of their own)
        describeBusinessFacts(data.knowledge),
        describeSituations(data.knowledge),
        describeWhatWeSell(data.whatWeSell),
        describeOffers(data.whatWeSell),
      ];
      const firstProblem = findUnbackedAmounts(answer.text, sources);
      if (firstProblem.length === 0) {
        return {
          reply: answer.text,
          state: stateAfterTurn,
          toolCalls: answer.toolCalls,
          heldBackAmounts: [],
          details: answer.details,
          modelFailedAfterActing: false,
        };
      }

      // One chance to fix it, with no tools (so nothing is saved or logged twice). The draft goes in the instructions, so the
      // conversation still ends with the customer's message.
      const secondTry = await aiService.generateText({
        accountId: input.accountId,
        tag,
        prompt: {
          ...prompt,
          changingSystemText: `${prompt.changingSystemText ?? ''}\n\nYOUR DRAFT ANSWER WAS:\n${answer.text}\n\n${describeAmountCorrection(firstProblem)}`,
        },
        temperature: 0.3,
      });
      const stillWrong = findUnbackedAmounts(secondTry.text, sources);
      return {
        reply: stillWrong.length === 0 ? secondTry.text : UNCONFIRMED_AMOUNT_REPLY,
        state: stateAfterTurn,
        toolCalls: answer.toolCalls,
        heldBackAmounts: stillWrong.length === 0 ? firstProblem : [...firstProblem, ...stillWrong],
        details: answer.details,
        modelFailedAfterActing: false,
      };
    },
  };
}
