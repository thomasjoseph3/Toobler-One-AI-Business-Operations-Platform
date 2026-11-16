import type { ZodType } from 'zod';
import { runToolLoop, type LoopMessage, type ModelTurn } from './tool-loop';
import type {
  LlmCandidate,
  LlmObjectResult,
  LlmProvider,
  LlmProviderId,
  LlmRequest,
  LlmTextResult,
  LlmToolsRequest,
  LlmToolsResult,
  LlmUsage,
} from './llm-types';
import { runWithFallback } from './run-with-fallback';

// A stand-in for the real provider, for tests: it answers from a script, never calls a model, and uses the same
// fallback loop as the real one. A script decides, per candidate, what happens: an answer, or an error to throw.

/** What the script returns for one try: the answer (text, or an object for generateObject) and optionally its tokens. */
export interface ScriptedAnswer {
  answer: unknown;
  usage?: Partial<LlmUsage>;
}

/**
 * What a scripted model says in one round of a tool conversation (the `answer` of a ScriptedAnswer): plain words end the
 * conversation, and `toolCalls` asks for tools to be run first.
 */
export interface ScriptedToolTurn {
  text?: string;
  toolCalls?: { name: string; input: unknown }[];
}

/**
 * The script: called for each try with the candidate and the request. Return an answer or throw an Error.
 * For `generateWithTools` it is called once per round, and `messagesSoFar` is the conversation so far including the tool results,
 * so a test can say what the model does in each round (an answer may be a string or a ScriptedToolTurn).
 */
export type LlmScript = (
  candidate: LlmCandidate,
  request: LlmRequest,
  messagesSoFar?: LoopMessage[],
) => ScriptedAnswer | Promise<ScriptedAnswer>;

const DEFAULT_USAGE: LlmUsage = { inputTokens: 12, outputTokens: 4, cachedTokens: 0, usageMissing: false };

/** A provider that follows the script, and remembers every request it was given (so tests can look at them). */
export function createScriptedLlmProvider(
  script: LlmScript,
  /** What the pretend company lists for a key. Throw to pretend the key is rejected. Default: nothing listed. */
  listModelsScript: (provider: LlmProviderId, apiKey: string) => string[] | Promise<string[]> = () => [],
): LlmProvider & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const answerOnce = async (candidate: LlmCandidate, request: LlmRequest, messagesSoFar?: LoopMessage[]) => {
    const scripted = await script(candidate, request, messagesSoFar);
    return { value: scripted.answer, usage: { ...DEFAULT_USAGE, ...scripted.usage } };
  };
  return {
    requests,
    listModels: async (provider, apiKey) => listModelsScript(provider, apiKey),
    async generateText(request): Promise<LlmTextResult> {
      requests.push(request);
      const outcome = await runWithFallback(request.candidates, (candidate) => answerOnce(candidate, request));
      return { text: String(outcome.value), details: outcome.details };
    },
    async generateObject<Value>(request: LlmRequest, schema: ZodType<Value>): Promise<LlmObjectResult<Value>> {
      requests.push(request);
      const outcome = await runWithFallback(request.candidates, async (candidate) => {
        const answered = await answerOnce(candidate, request);
        return { value: schema.parse(answered.value), usage: answered.usage };
      });
      return { value: outcome.value, details: outcome.details };
    },
    async generateWithTools(request: LlmToolsRequest): Promise<LlmToolsResult> {
      requests.push(request);
      // The same loop as the real provider runs here; only the "ask the model once" step is the script.
      return runToolLoop({
        startMessages: request.prompt.messages.map((message) => ({
          kind: 'text' as const,
          role: message.role,
          text: message.text,
        })),
        tools: request.tools,
        maxRounds: request.maxRounds,
        askModelOnce: async (messagesSoFar): Promise<ModelTurn> => {
          const outcome = await runWithFallback(request.candidates, (candidate) =>
            answerOnce(candidate, request, messagesSoFar),
          );
          const scripted = outcome.value;
          const turn: ScriptedToolTurn =
            typeof scripted === 'string' ? { text: scripted } : (scripted as ScriptedToolTurn);
          return {
            text: turn.text ?? '',
            toolCalls: (turn.toolCalls ?? []).map((call, position) => ({
              callId: `call_${messagesSoFar.length}_${position}`,
              toolName: call.name,
              input: call.input,
            })),
            details: outcome.details,
          };
        },
      });
    },
  };
}
