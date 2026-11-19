import type { ZodType } from 'zod';

// The shapes the AI model layer works with. The rest of the app only knows these; which AI company answers (and which
// code library talks to it) is decided inside this folder.

/** The AI companies we can call. A new one is added here and gets its own small adapter in langchain-provider.ts. */
export const LLM_PROVIDER_IDS = ['gemini', 'openai', 'anthropic'] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** Whose key paid for a call: the platform's own (demos) or the business's. */
export type LlmKeySource = 'platform' | 'own';

/** One thing to try: a model of a provider, with one key. A call is given an ordered list of these. */
export interface LlmCandidate {
  provider: LlmProviderId;
  modelName: string;
  /** The secret key. Never log it, never put it in an error or a result. */
  apiKey: string;
  keySource: LlmKeySource;
  /** Which key of its list this is (1, 2, 3...). This, not the key, is what logs and results show. */
  keyPosition: number;
}

/** Who is asking, for usage records. Every call must carry one, so usage can always be split by job, agent and channel. */
export interface LlmCallTag {
  /** The kind of job, like `classify_conversation`. */
  task: string;
  /** Which agent made the call, like `email`, `whatsapp`, `voice`, `webchat`, `classifier`. */
  agentId: string;
  /** Which channel the conversation came in on, or `internal` when there is none. */
  channel: string;
  /** The version of the prompt rules that built this call's prompt. */
  promptVersion: string;
  conversationId?: string | null;
}

/** What to ask. The stable part comes first on purpose: providers cache a long identical start and charge less for it. */
export interface LlmPrompt {
  /** Instructions that are the same on every call (rules, business knowledge). Put the longest, steadiest text here. */
  stableSystemText: string;
  /** Instructions that change per call (today's date, the contact's facts). Kept after the stable part. */
  changingSystemText?: string;
  messages: { role: 'user' | 'assistant'; text: string }[];
}

export interface LlmRequest {
  tag: LlmCallTag;
  /** The models and keys to try, best first. The first that works answers; the rest are fallbacks. */
  candidates: LlmCandidate[];
  prompt: LlmPrompt;
  temperature?: number;
  maxOutputTokens?: number;
}

/** What a failed attempt was, in words the app can act on. */
export type LlmErrorKind = 'rate_limited' | 'bad_key' | 'model_missing' | 'timed_out' | 'error';

/** One try with one model and one key. The key itself is never recorded, only its position. */
export interface LlmAttempt {
  provider: LlmProviderId;
  modelName: string;
  keySource: LlmKeySource;
  keyPosition: number;
  /** `ok`, or why it failed. */
  outcome: 'ok' | LlmErrorKind;
  /** True when a rate limit looks like the day's quota (so the key should rest longer). */
  dailyQuota?: boolean;
}

/** Tokens a call used. Numbers come from the provider's own reply, never from a guess. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens the provider served from its cache (cheaper). */
  cachedTokens: number;
  /** True when the provider sent no numbers (counted as zero, never invented). */
  usageMissing: boolean;
}

/** Who answered, how, and at what cost. Returned next to every answer. */
export interface LlmCallDetails {
  servedBy: { provider: LlmProviderId; modelName: string; keySource: LlmKeySource; keyPosition: number };
  attempts: LlmAttempt[];
  /** True when the first choice did not answer and a later one did. */
  fallbackUsed: boolean;
  /** Why the first choice failed (only when `fallbackUsed`). */
  fallbackReason: LlmErrorKind | null;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmTextResult {
  text: string;
  details: LlmCallDetails;
}

export interface LlmObjectResult<Value> {
  value: Value;
  details: LlmCallDetails;
}

/**
 * One thing the model may ask the app to do (look up a price, save a detail). The model only supplies the input; what the tool
 * does, and for which business, is fixed by the code that built it, so the model can never choose whose data a tool touches.
 */
export interface LlmTool {
  /** The name the model calls it by, like `search_knowledge`. */
  name: string;
  /** Tells the model when to use it. */
  description: string;
  /** The shape of the input. The model's input is checked against it before the tool runs. */
  inputSchema: ZodType;
  /** Does the work and gives the model the result as text. A thrown error is told to the model as a failed try. */
  run(input: unknown): Promise<string>;
}

/** A call to `generateWithTools`: an ordinary request plus the tools the model may use. */
export interface LlmToolsRequest extends LlmRequest {
  tools: LlmTool[];
  /** The most times the model may be asked in one answer (each time it may ask for tools). Default 8. */
  maxRounds?: number;
}

/** One tool the model asked for, for the agent's own records. `result` is what the tool answered, or why it failed. */
export interface LlmToolCallRecord {
  toolName: string;
  input: unknown;
  ok: boolean;
  result: string;
}

export interface LlmToolsResult {
  /** The model's final words to the customer. Empty when it never gave a final answer (see `hitRoundLimit`). */
  text: string;
  /** Every tool the model asked for, in order. */
  toolCalls: LlmToolCallRecord[];
  /** True when the model was still asking for tools after the last allowed round, so there is no answer to give. */
  hitRoundLimit: boolean;
  /** All the rounds together: every attempt, the tokens added up, the total time. */
  details: LlmCallDetails;
}

/** The AI model layer: ask for text, for an answer that fits a zod shape, or for an answer that may use tools. Real in the app, scripted in tests. */
export interface LlmProvider {
  /**
   * The names of the models a company says this key can see (its "list models" call). The list alone does not prove a model works for
   * a key: only a real call does. Throws when the company cannot be reached or rejects the key.
   */
  listModels(provider: LlmProviderId, apiKey: string): Promise<string[]>;
  generateText(request: LlmRequest): Promise<LlmTextResult>;
  generateObject<Value>(request: LlmRequest, schema: ZodType<Value>): Promise<LlmObjectResult<Value>>;
  /** Asks the model, runs the tools it asks for, and asks again, until it answers or the rounds run out. */
  generateWithTools(request: LlmToolsRequest): Promise<LlmToolsResult>;
}

/** Thrown when every model and key was tried and none answered. Carries what was tried (never a key). */
export class LlmAllAttemptsFailedError extends Error {
  constructor(
    readonly attempts: LlmAttempt[],
    readonly lastErrorKind: LlmErrorKind,
  ) {
    super(`No AI model could answer (last problem: ${lastErrorKind}).`);
  }
}

/** Thrown when a call is made with no models to try. */
export class LlmNoCandidatesError extends Error {
  constructor() {
    super('No AI model or key is available for this call.');
  }
}
