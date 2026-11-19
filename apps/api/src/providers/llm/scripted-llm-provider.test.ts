import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmAllAttemptsFailedError, type LlmCandidate, type LlmRequest } from './llm-types';
import { createScriptedLlmProvider } from './scripted-llm-provider';

const candidate = (modelName: string, keyPosition = 1): LlmCandidate => ({
  provider: 'gemini',
  modelName,
  apiKey: 'secret',
  keySource: 'platform',
  keyPosition,
});
const requestWith = (candidates: LlmCandidate[]): LlmRequest => ({
  tag: { task: 'chat_reply', agentId: 'test', channel: 'internal', promptVersion: 'test-1' },
  candidates,
  prompt: { stableSystemText: 'rules', messages: [{ role: 'user', text: 'hi' }] },
});

describe('the scripted provider', () => {
  it('answers text from the script, with the default token numbers, and remembers the request', async () => {
    const provider = createScriptedLlmProvider(() => ({ answer: 'Hello there' }));
    const request = requestWith([candidate('m1')]);
    const result = await provider.generateText(request);
    expect(result.text).toBe('Hello there');
    expect(result.details.usage).toMatchObject({ inputTokens: 12, outputTokens: 4, usageMissing: false });
    expect(provider.requests).toEqual([request]);
  });

  it('uses the real fallback loop: the first model fails, the second answers', async () => {
    const provider = createScriptedLlmProvider((tried) => {
      if (tried.modelName === 'primary') throw new Error('429 quota exceeded');
      return { answer: 'from the fallback', usage: { cachedTokens: 9 } };
    });
    const result = await provider.generateText(requestWith([candidate('primary'), candidate('backup')]));
    expect(result.details).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'rate_limited',
      servedBy: { modelName: 'backup' },
      usage: { cachedTokens: 9 },
    });
  });

  it('checks an object answer against the shape, treating a wrong shape as a failed try', async () => {
    const shape = z.object({ type: z.enum(['complaint', 'enquiry']), confidence: z.number() });
    const provider = createScriptedLlmProvider((tried) =>
      tried.modelName === 'sloppy'
        ? { answer: { type: 'banana', confidence: 1 } }
        : { answer: { type: 'complaint', confidence: 0.9 } },
    );
    const result = await provider.generateObject(requestWith([candidate('sloppy'), candidate('careful')]), shape);
    expect(result.value).toEqual({ type: 'complaint', confidence: 0.9 });
    expect(result.details.servedBy.modelName).toBe('careful');
    expect(result.details.fallbackUsed).toBe(true);
  });

  it('throws when every try fails', async () => {
    const provider = createScriptedLlmProvider(() => {
      throw new Error('API key not valid');
    });
    await expect(provider.generateText(requestWith([candidate('m1')]))).rejects.toBeInstanceOf(
      LlmAllAttemptsFailedError,
    );
  });
});
