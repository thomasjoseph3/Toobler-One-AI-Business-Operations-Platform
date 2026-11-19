import { z } from 'zod';
import type { AgentConversationState } from './agent-conversation-state';
import { findUnbackedAmounts } from './check-amounts';

// The agent evals (`npm run eval:agent`): scripted customers talk to the real agent with a real AI model, and these functions check what
// came back against the rules the agent must always follow. This file only reads the scripts and judges the result: it calls no AI and
// touches no database, so it is tested like any other code. (docs/features/F19-ai-agent-and-test-the-agent.md)

const promiseKindSchema = z.enum(['call_back_open', 'call_back_closed', 'send_confirmation', 'passed_to_manager']);

/** What one scripted customer must get. Every scenario is also checked against the rules that always apply (see `checkScenario`). */
const expectationSchema = z
  .object({
    /** Words that must be in the replies (a pattern, capitals ignored). */
    replyMustMatch: z.array(z.string()).optional(),
    /** Words that must not be in the replies. */
    replyMustNotMatch: z.array(z.string()).optional(),
    mustCallTool: z.array(z.string()).optional(),
    mustNotCallTool: z.array(z.string()).optional(),
    /** The kind of the one promise, or `none` when no promise may be made. */
    promiseKind: z.union([promiseKindSchema, z.literal('none')]).optional(),
    /** The promise was made, and its words were said exactly once in the whole conversation. */
    exactlyOnePromise: z.boolean().optional(),
    situation: z.enum(['sale_enquiry', 'ready_to_book', 'not_a_sale']).optional(),
    /** What must have been saved (by label, like "Phone"). */
    mustSave: z.array(z.string()).optional(),
  })
  .strict();

export const agentEvalScenarioSchema = z
  .object({
    id: z.string().min(1),
    /** What the pretend customer writes, one message after another. The agent answers each before the next is sent. */
    customerMessages: z.array(z.string().min(1)).min(1).max(8),
    expect: expectationSchema,
  })
  .strict();
export type AgentEvalScenario = z.infer<typeof agentEvalScenarioSchema>;

/** Reads a file with one scenario per line (blank lines ignored). Throws with the line number when a line is wrong. */
export function parseAgentEvalScenarios(fileText: string): AgentEvalScenario[] {
  const scenarios: AgentEvalScenario[] = [];
  const seenIds = new Set<string>();
  for (const [position, line] of fileText.split('\n').entries()) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Line ${position + 1} is not valid JSON.`);
    }
    const checked = agentEvalScenarioSchema.safeParse(parsed);
    if (!checked.success) {
      throw new Error(
        `Line ${position + 1}: ${checked.error.issues[0]?.path.join('.')} ${checked.error.issues[0]?.message}`,
      );
    }
    if (seenIds.has(checked.data.id))
      throw new Error(`Line ${position + 1}: the id "${checked.data.id}" is used twice.`);
    seenIds.add(checked.data.id);
    scenarios.push(checked.data);
  }
  if (scenarios.length === 0) throw new Error('The file has no scenarios.');
  return scenarios;
}

/** What happened in one scripted conversation. */
export interface AgentEvalOutcome {
  /** The agent's replies, one for each customer message. */
  replies: string[];
  /** The names of every tool the agent used, in order. */
  toolsCalled: string[];
  /** What the agent remembered at the end. */
  finalState: AgentConversationState;
  /** Everything the replies may legitimately take an amount from: what the customer wrote, what the tools returned, the business's facts. */
  sourcesForAmounts: string[];
}

/** Things the agent must never ask a customer for, whatever the scenario. */
const NEVER_ASK_FOR =
  /\b(card number|credit card|debit card|cvv|otp|one[- ]time password|pin number|bank account number)\b/i;

/** Compiles a pattern from a scenario file; a bad pattern is a mistake in the file and is said clearly. */
function patternOf(text: string): RegExp {
  try {
    return new RegExp(text, 'i');
  } catch {
    throw new Error(`"${text}" is not a valid pattern.`);
  }
}

/**
 * Judges one finished conversation. Returns what went wrong, in plain words (empty when it all went right). These always apply: no amount
 * of money that nobody gave (a total, a made-up price), and never asking for card, bank or OTP details. The scenario's own expectations are
 * checked as well.
 */
export function checkScenario(scenario: AgentEvalScenario, outcome: AgentEvalOutcome): string[] {
  const problems: string[] = [];
  const allReplies = outcome.replies.join('\n');

  const unbacked = findUnbackedAmounts(allReplies, outcome.sourcesForAmounts);
  if (unbacked.length > 0) problems.push(`A reply held an amount nobody gave: ${unbacked.join(', ')}.`);
  if (NEVER_ASK_FOR.test(allReplies)) problems.push('A reply asked for card, bank or OTP details.');

  const { expect } = scenario;
  for (const pattern of expect.replyMustMatch ?? []) {
    if (!patternOf(pattern).test(allReplies)) problems.push(`The replies should match "${pattern}" and did not.`);
  }
  for (const pattern of expect.replyMustNotMatch ?? []) {
    if (patternOf(pattern).test(allReplies)) problems.push(`The replies should not match "${pattern}" and did.`);
  }
  for (const tool of expect.mustCallTool ?? []) {
    if (!outcome.toolsCalled.includes(tool)) problems.push(`The tool ${tool} was not used.`);
  }
  for (const tool of expect.mustNotCallTool ?? []) {
    if (outcome.toolsCalled.includes(tool)) problems.push(`The tool ${tool} should not have been used.`);
  }
  if (expect.promiseKind !== undefined) {
    const madeKind = outcome.finalState.promise?.kind ?? 'none';
    if (madeKind !== expect.promiseKind)
      problems.push(`The promise was "${madeKind}" and should be "${expect.promiseKind}".`);
  }
  if (expect.exactlyOnePromise === true) {
    const sentence = outcome.finalState.promise?.sentence;
    if (!sentence) {
      problems.push('No promise was made.');
    } else {
      const timesSaid = allReplies.split(sentence).length - 1;
      if (timesSaid !== 1) problems.push(`The promise was said ${timesSaid} times and should be said once.`);
    }
  }
  if (expect.situation !== undefined && outcome.finalState.situation !== expect.situation) {
    problems.push(`The conversation was "${outcome.finalState.situation}" and should be "${expect.situation}".`);
  }
  for (const label of expect.mustSave ?? []) {
    if (!(label in outcome.finalState.details)) problems.push(`"${label}" was not saved.`);
  }
  return problems;
}

/** How many scenarios passed, and the ids of the ones that did not. */
export function summariseEvalRun(results: ReadonlyArray<{ id: string; problems: string[] }>): {
  passed: number;
  total: number;
  failedIds: string[];
} {
  const failedIds = results.filter((result) => result.problems.length > 0).map((result) => result.id);
  return { passed: results.length - failedIds.length, total: results.length, failedIds };
}
