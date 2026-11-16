import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { tool as describeToolForModel } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { ZodType } from 'zod';
import type {
  LlmCandidate,
  LlmObjectResult,
  LlmPrompt,
  LlmProvider,
  LlmRequest,
  LlmTextResult,
  LlmToolsRequest,
  LlmToolsResult,
  LlmUsage,
} from './llm-types';
import { listProviderModels } from './list-provider-models';
import { runWithFallback, type OneTryResult } from './run-with-fallback';
import { runToolLoop, type LoopMessage, type ModelTurn } from './tool-loop';

// The one file that knows how to talk to Gemini, OpenAI and Claude, through LangChain. A lint rule keeps every other file
// from importing these packages. To add another AI company: add its id in llm-types.ts and one case in buildChatModel.

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
// One try may take this long. A provider that hangs must not hold up the customer: after this the next model or key is tried.
const ATTEMPT_TIMEOUT_MS = 30_000;

/** The LangChain chat model for one candidate. `maxRetries: 0`: retrying is our job (the next key or model), not the library's. */
function buildChatModel(candidate: LlmCandidate, request: LlmRequest) {
  const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
  const maxOutputTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  switch (candidate.provider) {
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        model: candidate.modelName,
        apiKey: candidate.apiKey,
        temperature,
        maxOutputTokens,
        maxRetries: 0,
      });
    case 'openai':
      return new ChatOpenAI({
        model: candidate.modelName,
        apiKey: candidate.apiKey,
        temperature,
        maxTokens: maxOutputTokens,
        maxRetries: 0,
      });
    case 'anthropic':
      return new ChatAnthropic({
        model: candidate.modelName,
        apiKey: candidate.apiKey,
        temperature,
        maxTokens: maxOutputTokens,
        maxRetries: 0,
      });
  }
}

/**
 * The messages to send. The stable instructions come first, then the changing ones, then the conversation. Claude caches
 * only when told where the stable part ends, so for Claude the stable text is its own block with a cache marker; OpenAI
 * and Gemini cache a long identical start by themselves, so for them it is plain text in the same order.
 */
export function buildMessages(prompt: LlmPrompt, candidate: LlmCandidate): BaseMessage[] {
  const conversation = prompt.messages.map((message) =>
    message.role === 'user' ? new HumanMessage(message.text) : new AIMessage(message.text),
  );
  return [buildSystemMessage(prompt, candidate), ...conversation];
}

/** The system message alone (the stable instructions, then the changing ones), built for the company that will read it. */
function buildSystemMessage(prompt: LlmPrompt, candidate: LlmCandidate): SystemMessage {
  const changingText = prompt.changingSystemText?.trim();
  return candidate.provider === 'anthropic'
    ? new SystemMessage({
        content: [
          { type: 'text', text: prompt.stableSystemText, cache_control: { type: 'ephemeral' } },
          ...(changingText ? [{ type: 'text', text: changingText }] : []),
        ],
      })
    : new SystemMessage(changingText ? `${prompt.stableSystemText}\n\n${changingText}` : prompt.stableSystemText);
}

/** Turns our plain conversation shape (with tool requests and answers) into the messages LangChain sends to the model. */
export function buildToolConversationMessages(
  prompt: LlmPrompt,
  candidate: LlmCandidate,
  loopMessages: readonly LoopMessage[],
): BaseMessage[] {
  const conversation = loopMessages.map((message): BaseMessage => {
    if (message.kind === 'tool_request') {
      return new AIMessage({
        content: message.text,
        tool_calls: message.calls.map((call) => ({
          type: 'tool_call' as const,
          id: call.callId,
          name: call.toolName,
          args: call.input as Record<string, unknown>,
        })),
      });
    }
    if (message.kind === 'tool_answer') {
      return new ToolMessage({ content: message.text, tool_call_id: message.callId, name: message.toolName });
    }
    return message.role === 'user' ? new HumanMessage(message.text) : new AIMessage(message.text);
  });
  return [buildSystemMessage(prompt, candidate), ...conversation];
}

/** Tokens from the provider's own reply. A reply with no numbers is counted as zero and flagged, never guessed. */
export function readUsage(reply: AIMessage): LlmUsage {
  const metadata = reply.usage_metadata;
  if (!metadata) return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, usageMissing: true };
  return {
    inputTokens: metadata.input_tokens,
    outputTokens: metadata.output_tokens,
    cachedTokens: metadata.input_token_details?.cache_read ?? 0,
    usageMissing: false,
  };
}

/** The text of a reply, whether the provider sent a string or a list of blocks. */
function readText(reply: AIMessage): string {
  if (typeof reply.content === 'string') return reply.content;
  return reply.content.map((block) => (block.type === 'text' && 'text' in block ? block.text : '')).join('');
}

/**
 * Gives the text back, or fails the try when the model said nothing. Some models (Gemini 2.5 with a small output limit) use
 * their whole allowance thinking and return an empty answer; that must trigger the fallback, not reach a customer.
 */
export function requireNonEmptyAnswer(text: string): string {
  if (text.trim() === '') throw new Error('The model returned an empty answer');
  return text;
}

/** The real provider: LangChain chat models, tried in the order given, with the fallback loop. */
export function createLangChainProvider(): LlmProvider {
  return {
    listModels: (provider, apiKey) => listProviderModels(provider, apiKey),

    async generateText(request): Promise<LlmTextResult> {
      const outcome = await runWithFallback(request.candidates, async (candidate): Promise<OneTryResult<string>> => {
        const reply = await buildChatModel(candidate, request).invoke(buildMessages(request.prompt, candidate), {
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        return { value: requireNonEmptyAnswer(readText(reply)), usage: readUsage(reply) };
      });
      return { text: outcome.value, details: outcome.details };
    },

    async generateObject<Value>(request: LlmRequest, schema: ZodType<Value>): Promise<LlmObjectResult<Value>> {
      const outcome = await runWithFallback(request.candidates, async (candidate): Promise<OneTryResult<Value>> => {
        const structuredModel = buildChatModel(candidate, request).withStructuredOutput(schema, { includeRaw: true });
        const reply = (await structuredModel.invoke(buildMessages(request.prompt, candidate), {
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        })) as {
          raw: AIMessage;
          parsed: unknown;
        };
        // The answer is checked against the shape again here, so a model that bends the shape is a failed try, not bad data
        return { value: schema.parse(reply.parsed), usage: readUsage(reply.raw) };
      });
      return { value: outcome.value, details: outcome.details };
    },

    async generateWithTools(request: LlmToolsRequest): Promise<LlmToolsResult> {
      // The model only needs to know each tool's name, what it is for and the shape of its input; running it is the loop's job.
      const toolDescriptions = request.tools.map((tool) =>
        describeToolForModel(async () => '', {
          name: tool.name,
          description: tool.description,
          schema: tool.inputSchema,
        }),
      );
      return runToolLoop({
        startMessages: request.prompt.messages.map((message) => ({
          kind: 'text' as const,
          role: message.role,
          text: message.text,
        })),
        tools: request.tools,
        maxRounds: request.maxRounds,
        askModelOnce: async (messagesSoFar): Promise<ModelTurn> => {
          const outcome = await runWithFallback(
            request.candidates,
            async (candidate): Promise<OneTryResult<Omit<ModelTurn, 'details'>>> => {
              const modelWithTools = buildChatModel(candidate, request).bindTools(toolDescriptions);
              const reply = (await modelWithTools.invoke(
                buildToolConversationMessages(request.prompt, candidate, messagesSoFar),
                { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) },
              )) as AIMessage;
              const text = readText(reply);
              const toolCalls = (reply.tool_calls ?? []).map((call, position) => ({
                callId: call.id ?? `call_${messagesSoFar.length}_${position}`,
                toolName: call.name,
                input: call.args,
              }));
              // A reply with neither words nor tool requests is a failed try (see requireNonEmptyAnswer)
              if (toolCalls.length === 0) requireNonEmptyAnswer(text);
              return { value: { text, toolCalls }, usage: readUsage(reply) };
            },
          );
          return { ...outcome.value, details: outcome.details };
        },
      });
    },
  };
}
