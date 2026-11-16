import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { combineCallDetails } from './combine-call-details';
import type { LlmCallDetails, LlmTool, LlmToolCallRecord, LlmToolsResult } from './llm-types';

// The loop behind `generateWithTools`: ask the model, run the tools it asks for, ask again, until it answers in words or the
// rounds run out. It is built with LangGraph (two steps and a choice between them) and does not know which AI company answers:
// the real provider and the scripted test provider each give it a way to "ask the model once", so tests run this same loop.

const DEFAULT_MAX_ROUNDS = 8;

/** What the model told the customer or asked for, in our own plain shape (the real provider turns it into LangChain's). */
export type LoopMessage =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool_request'; text: string; calls: RequestedToolCall[] }
  | { kind: 'tool_answer'; callId: string; toolName: string; text: string };

/** One tool the model asked for in a round. */
export interface RequestedToolCall {
  callId: string;
  toolName: string;
  input: unknown;
}

/** What one asking of the model gave: its words (maybe empty) and the tools it wants run. */
export interface ModelTurn {
  text: string;
  toolCalls: RequestedToolCall[];
  details: LlmCallDetails;
}

/** Asks the model once, with the conversation so far. The key and model fallback happen inside. */
export type AskModelOnce = (messages: LoopMessage[]) => Promise<ModelTurn>;

/** What the model is told when it asks for a tool that does not exist, or gives input that does not fit. It can then fix it. */
function describeBadInput(toolName: string, problem: string): string {
  return `The call to ${toolName} was not accepted: ${problem}`;
}

/** Runs one tool the model asked for. Never throws: a problem is told to the model as a result, so it can carry on. */
async function runOneTool(tools: readonly LlmTool[], call: RequestedToolCall): Promise<LlmToolCallRecord> {
  const tool = tools.find((candidate) => candidate.name === call.toolName);
  if (!tool) {
    return {
      toolName: call.toolName,
      input: call.input,
      ok: false,
      result: describeBadInput(call.toolName, 'there is no such tool.'),
    };
  }
  const checked = tool.inputSchema.safeParse(call.input);
  if (!checked.success) {
    const problem = checked.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return { toolName: call.toolName, input: call.input, ok: false, result: describeBadInput(call.toolName, problem) };
  }
  try {
    return { toolName: call.toolName, input: call.input, ok: true, result: await tool.run(checked.data) };
  } catch {
    // The reason is not shown to the model: it could hold details the customer must not be told. The agent's own log has it.
    return {
      toolName: call.toolName,
      input: call.input,
      ok: false,
      result: `${call.toolName} did not work this time. Carry on without it or try different input.`,
    };
  }
}

/** The things the graph remembers while it runs. `Annotation` says how a step's output is joined to what is already there. */
const LoopState = Annotation.Root({
  messages: Annotation<LoopMessage[]>({ reducer: (existing, added) => existing.concat(added), default: () => [] }),
  toolCallRecords: Annotation<LlmToolCallRecord[]>({
    reducer: (existing, added) => existing.concat(added),
    default: () => [],
  }),
  roundDetails: Annotation<LlmCallDetails[]>({
    reducer: (existing, added) => existing.concat(added),
    default: () => [],
  }),
  roundsUsed: Annotation<number>({ reducer: (_existing, latest) => latest, default: () => 0 }),
  latestTurn: Annotation<ModelTurn | null>({ reducer: (_existing, latest) => latest, default: () => null }),
});

/**
 * Runs the loop. `startMessages` is the conversation so far. Returns the final words, every tool call, whether the round limit
 * stopped it, and the details of all rounds together.
 */
export async function runToolLoop(input: {
  startMessages: LoopMessage[];
  tools: readonly LlmTool[];
  maxRounds?: number | undefined;
  askModelOnce: AskModelOnce;
}): Promise<LlmToolsResult> {
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const graph = new StateGraph(LoopState)
    // Step 1: ask the model with everything said so far.
    .addNode('askModel', async (state) => {
      const turn = await input.askModelOnce(state.messages);
      const modelMessage: LoopMessage =
        turn.toolCalls.length > 0
          ? { kind: 'tool_request', text: turn.text, calls: turn.toolCalls }
          : { kind: 'text', role: 'assistant', text: turn.text };
      return {
        messages: [modelMessage],
        roundDetails: [turn.details],
        roundsUsed: state.roundsUsed + 1,
        latestTurn: turn,
      };
    })
    // Step 2: run each tool the model asked for, one after the other, and give the model what they answered.
    .addNode('runTools', async (state) => {
      const records: LlmToolCallRecord[] = [];
      const answers: LoopMessage[] = [];
      for (const call of state.latestTurn?.toolCalls ?? []) {
        const record = await runOneTool(input.tools, call);
        records.push(record);
        answers.push({ kind: 'tool_answer', callId: call.callId, toolName: call.toolName, text: record.result });
      }
      return { messages: answers, toolCallRecords: records };
    })
    .addEdge(START, 'askModel')
    // After asking: no tools wanted means this is the answer; tools wanted but no rounds left means stop without one.
    .addConditionalEdges('askModel', (state) => {
      const wantsTools = (state.latestTurn?.toolCalls.length ?? 0) > 0;
      if (!wantsTools) return END;
      return state.roundsUsed >= maxRounds ? END : 'runTools';
    })
    .addEdge('runTools', 'askModel')
    .compile();

  // Each round is two steps; the extra room is only so LangGraph's own safety stop never fires before our round limit.
  const finalState = await graph.invoke({ messages: input.startMessages }, { recursionLimit: maxRounds * 2 + 5 });

  const lastTurn = finalState.latestTurn;
  const hitRoundLimit = (lastTurn?.toolCalls.length ?? 0) > 0;
  return {
    text: hitRoundLimit ? '' : (lastTurn?.text ?? ''),
    toolCalls: finalState.toolCallRecords,
    hitRoundLimit,
    details: combineCallDetails(finalState.roundDetails),
  };
}
