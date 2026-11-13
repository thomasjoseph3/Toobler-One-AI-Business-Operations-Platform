import type { ZodType } from 'zod';
import type {
  LlmCandidate,
  LlmObjectResult,
  LlmProvider,
  LlmProviderId,
  LlmRequest,
  LlmTextResult,
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

/** The script: called for each try with the candidate and the request. Return an answer or throw an Error. */
export type LlmScript = (candidate: LlmCandidate, request: LlmRequest) => ScriptedAnswer | Promise<ScriptedAnswer>;

const DEFAULT_USAGE: LlmUsage = { inputTokens: 12, outputTokens: 4, cachedTokens: 0, usageMissing: false };

/** A provider that follows the script, and remembers every request it was given (so tests can look at them). */
export function createScriptedLlmProvider(
  script: LlmScript,
  /** What the pretend company lists for a key. Throw to pretend the key is rejected. Default: nothing listed. */
  listModelsScript: (provider: LlmProviderId, apiKey: string) => string[] | Promise<string[]> = () => [],
): LlmProvider & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const answerOnce = async (candidate: LlmCandidate, request: LlmRequest) => {
    const scripted = await script(candidate, request);
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
  };
}
