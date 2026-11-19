import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmAllAttemptsFailedError, type LlmCandidate, type LlmTool, type LlmToolsRequest } from './llm-types';
import { createScriptedLlmProvider, type LlmScript } from './scripted-llm-provider';

const candidate = (modelName: string, keyPosition = 1): LlmCandidate => ({
  provider: 'gemini',
  modelName,
  apiKey: 'secret',
  keySource: 'platform',
  keyPosition,
});

/** A tool that echoes what it was asked and remembers its inputs, so a test can see what ran. */
function makeEchoTool(name = 'search_knowledge'): LlmTool & { receivedInputs: unknown[] } {
  const receivedInputs: unknown[] = [];
  return {
    name,
    description: 'Looks something up.',
    inputSchema: z.object({ question: z.string().min(1) }),
    receivedInputs,
    run: async (input) => {
      receivedInputs.push(input);
      return 'Parking is free for guests.';
    },
  };
}

const requestWith = (tools: LlmTool[], candidates = [candidate('m1')], maxRounds?: number): LlmToolsRequest => ({
  tag: { task: 'chat_reply', agentId: 'test', channel: 'internal', promptVersion: 'test-1' },
  candidates,
  prompt: { stableSystemText: 'rules', messages: [{ role: 'user', text: 'Is parking free?' }] },
  tools,
  ...(maxRounds !== undefined ? { maxRounds } : {}),
});

/** A script that asks for the tool in the first round, then answers once it has seen the tool's result. */
const askThenAnswer: LlmScript = (_candidate, _request, messagesSoFar = []) => {
  const toolWasAnswered = messagesSoFar.some((message) => message.kind === 'tool_answer');
  return toolWasAnswered
    ? { answer: 'Yes, parking is free for guests.' }
    : { answer: { toolCalls: [{ name: 'search_knowledge', input: { question: 'parking' } }] } };
};

describe('generateWithTools (the tool loop)', () => {
  it('answers in words straight away when the model asks for no tool', async () => {
    const provider = createScriptedLlmProvider(() => ({ answer: 'Hello!' }));
    const result = await provider.generateWithTools(requestWith([makeEchoTool()]));
    expect(result).toMatchObject({ text: 'Hello!', toolCalls: [], hitRoundLimit: false });
  });

  it('runs the tool the model asked for, gives the model its result, and returns the final words', async () => {
    const tool = makeEchoTool();
    const provider = createScriptedLlmProvider(askThenAnswer);
    const result = await provider.generateWithTools(requestWith([tool]));
    expect(result.text).toBe('Yes, parking is free for guests.');
    expect(tool.receivedInputs).toEqual([{ question: 'parking' }]);
    expect(result.toolCalls).toEqual([
      { toolName: 'search_knowledge', input: { question: 'parking' }, ok: true, result: 'Parking is free for guests.' },
    ]);
    expect(result.hitRoundLimit).toBe(false);
  });

  it('counts the rounds as one call: tokens added up over both rounds', async () => {
    const provider = createScriptedLlmProvider(askThenAnswer);
    const result = await provider.generateWithTools(requestWith([makeEchoTool()]));
    // The scripted default is 12 in and 4 out per round, and this answer took two rounds
    expect(result.details.usage).toMatchObject({ inputTokens: 24, outputTokens: 8 });
    expect(result.details.attempts).toHaveLength(2);
  });

  it('stops after the round limit and says there is no answer, when the model keeps asking for tools', async () => {
    const tool = makeEchoTool();
    const provider = createScriptedLlmProvider(() => ({
      answer: { toolCalls: [{ name: 'search_knowledge', input: { question: 'again' } }] },
    }));
    const result = await provider.generateWithTools(requestWith([tool], [candidate('m1')], 3));
    expect(result.hitRoundLimit).toBe(true);
    expect(result.text).toBe('');
    // Three rounds asked for the tool; the last request is not run because there is no round left to read its answer
    expect(tool.receivedInputs).toHaveLength(2);
    expect(result.details.attempts).toHaveLength(3);
  });

  it('tells the model when it asks for a tool that does not exist, and lets it carry on', async () => {
    const provider = createScriptedLlmProvider((_candidate, _request, messagesSoFar = []) =>
      messagesSoFar.some((message) => message.kind === 'tool_answer')
        ? { answer: 'Sorry, I cannot do that.' }
        : { answer: { toolCalls: [{ name: 'delete_everything', input: {} }] } },
    );
    const result = await provider.generateWithTools(requestWith([makeEchoTool()]));
    expect(result.toolCalls[0]).toMatchObject({ toolName: 'delete_everything', ok: false });
    expect(result.toolCalls[0]?.result).toContain('no such tool');
    expect(result.text).toBe('Sorry, I cannot do that.');
  });

  it('does not run a tool whose input does not fit its shape, and tells the model what was wrong', async () => {
    const tool = makeEchoTool();
    const provider = createScriptedLlmProvider((_candidate, _request, messagesSoFar = []) =>
      messagesSoFar.some((message) => message.kind === 'tool_answer')
        ? { answer: 'Let me rephrase.' }
        : { answer: { toolCalls: [{ name: 'search_knowledge', input: { question: '' } }] } },
    );
    const result = await provider.generateWithTools(requestWith([tool]));
    expect(tool.receivedInputs).toEqual([]);
    expect(result.toolCalls[0]).toMatchObject({ ok: false });
    expect(result.toolCalls[0]?.result).toContain('question');
  });

  it('turns a tool that throws into a failed try for the model, without showing the error text', async () => {
    const breakingTool: LlmTool = {
      name: 'search_knowledge',
      description: 'Breaks.',
      inputSchema: z.object({ question: z.string() }),
      run: async () => {
        throw new Error('connection to db-internal-host refused');
      },
    };
    const provider = createScriptedLlmProvider(askThenAnswer);
    const result = await provider.generateWithTools(requestWith([breakingTool]));
    expect(result.toolCalls[0]).toMatchObject({ ok: false });
    expect(result.toolCalls[0]?.result).not.toContain('db-internal-host');
    expect(result.text).toBe('Yes, parking is free for guests.');
  });

  it('runs several tools asked for in one round, in order', async () => {
    const first = makeEchoTool('get_business_info');
    const second = makeEchoTool('search_knowledge');
    const provider = createScriptedLlmProvider((_candidate, _request, messagesSoFar = []) =>
      messagesSoFar.some((message) => message.kind === 'tool_answer')
        ? { answer: 'Done.' }
        : {
            answer: {
              toolCalls: [
                { name: 'get_business_info', input: { question: 'hours' } },
                { name: 'search_knowledge', input: { question: 'parking' } },
              ],
            },
          },
    );
    const result = await provider.generateWithTools(requestWith([first, second]));
    expect(result.toolCalls.map((call) => call.toolName)).toEqual(['get_business_info', 'search_knowledge']);
  });

  it('falls back to the next model in a round when the first fails', async () => {
    const provider = createScriptedLlmProvider((tried, request, messagesSoFar) => {
      if (tried.modelName === 'm1') throw new Error('429 quota exceeded');
      return askThenAnswer(tried, request, messagesSoFar);
    });
    const result = await provider.generateWithTools(
      requestWith([makeEchoTool()], [candidate('m1'), candidate('m2', 2)]),
    );
    expect(result.text).toBe('Yes, parking is free for guests.');
    expect(result.details.fallbackUsed).toBe(true);
    expect(result.details.servedBy.modelName).toBe('m2');
  });

  it('fails clearly when every model fails', async () => {
    const provider = createScriptedLlmProvider(() => {
      throw new Error('401 invalid api key');
    });
    await expect(provider.generateWithTools(requestWith([makeEchoTool()]))).rejects.toBeInstanceOf(
      LlmAllAttemptsFailedError,
    );
  });

  it('gives the tool the validated input, not the model’s raw one', async () => {
    const tool: LlmTool & { received: unknown[] } = {
      name: 'search_knowledge',
      description: 'x',
      inputSchema: z.object({ question: z.string() }),
      received: [],
      run: async (input) => {
        tool.received.push(input);
        return 'ok';
      },
    };
    const provider = createScriptedLlmProvider(askThenAnswer);
    await provider.generateWithTools(requestWith([tool]));
    // zod strips keys the shape does not know, so an extra key the model made up never reaches the tool
    expect(tool.received).toEqual([{ question: 'parking' }]);
  });
});
