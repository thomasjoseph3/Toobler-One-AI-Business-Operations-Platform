import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
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
  LlmUsage,
} from './llm-types';
import { listProviderModels } from './list-provider-models';
import { runWithFallback, type OneTryResult } from './run-with-fallback';

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
  const changingText = prompt.changingSystemText?.trim();
  const systemMessage =
    candidate.provider === 'anthropic'
      ? new SystemMessage({
          content: [
            { type: 'text', text: prompt.stableSystemText, cache_control: { type: 'ephemeral' } },
            ...(changingText ? [{ type: 'text', text: changingText }] : []),
          ],
        })
      : new SystemMessage(changingText ? `${prompt.stableSystemText}\n\n${changingText}` : prompt.stableSystemText);
  const conversation = prompt.messages.map((message) =>
    message.role === 'user' ? new HumanMessage(message.text) : new AIMessage(message.text),
  );
  return [systemMessage, ...conversation];
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
  };
}
