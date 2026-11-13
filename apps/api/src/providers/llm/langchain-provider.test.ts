import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { buildMessages, readUsage, requireNonEmptyAnswer } from './langchain-provider';
import type { LlmCandidate, LlmPrompt } from './llm-types';

const candidateOf = (provider: LlmCandidate['provider']): LlmCandidate => ({
  provider,
  modelName: 'any',
  apiKey: 'secret-key-1',
  keySource: 'platform',
  keyPosition: 1,
});
const prompt: LlmPrompt = {
  stableSystemText: 'STABLE rules and business knowledge',
  changingSystemText: 'CHANGING today is Monday',
  messages: [
    { role: 'user', text: 'Hello' },
    { role: 'assistant', text: 'Hi, how can I help?' },
    { role: 'user', text: 'What are your hours?' },
  ],
};

describe('buildMessages (what is sent to the model)', () => {
  it('puts the stable text before the changing text and the conversation last, for OpenAI and Gemini', () => {
    for (const provider of ['openai', 'gemini'] as const) {
      const messages = buildMessages(prompt, candidateOf(provider));
      const systemText = String(messages[0]?.content);
      expect(systemText.indexOf('STABLE')).toBeLessThan(systemText.indexOf('CHANGING'));
      expect(messages.map((message) => message.type)).toEqual(['system', 'human', 'ai', 'human']);
    }
  });

  it('marks the end of the stable text for Claude, which caches only when told, and keeps the changing text after it', () => {
    const messages = buildMessages(prompt, candidateOf('anthropic'));
    const blocks = messages[0]?.content as { type: string; text: string; cache_control?: unknown }[];
    expect(blocks[0]).toMatchObject({
      text: 'STABLE rules and business knowledge',
      cache_control: { type: 'ephemeral' },
    });
    expect(blocks[1]).toEqual({ type: 'text', text: 'CHANGING today is Monday' });
  });

  it('works with no changing text', () => {
    const noChange: LlmPrompt = { stableSystemText: 'only stable', messages: [{ role: 'user', text: 'x' }] };
    expect(String(buildMessages(noChange, candidateOf('openai'))[0]?.content)).toBe('only stable');
    expect((buildMessages(noChange, candidateOf('anthropic'))[0]?.content as unknown[]).length).toBe(1);
  });

  it('does not put any key in the messages', () => {
    for (const provider of ['openai', 'gemini', 'anthropic'] as const) {
      expect(JSON.stringify(buildMessages(prompt, candidateOf(provider)))).not.toContain('secret-key');
    }
  });
});

describe('requireNonEmptyAnswer', () => {
  it('passes real text through unchanged', () => {
    expect(requireNonEmptyAnswer(' Hello ')).toBe(' Hello ');
  });
  it('fails a try whose answer is empty or only spaces', () => {
    expect(() => requireNonEmptyAnswer('')).toThrow(/empty answer/);
    expect(() => requireNonEmptyAnswer('  \n ')).toThrow(/empty answer/);
  });
});

describe('readUsage (tokens come from the provider, never guessed)', () => {
  it('reads input, output and cached tokens', () => {
    const reply = new AIMessage({
      content: 'hi',
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_token_details: { cache_read: 80 },
      },
    });
    expect(readUsage(reply)).toEqual({ inputTokens: 100, outputTokens: 20, cachedTokens: 80, usageMissing: false });
  });
  it('counts cached tokens as zero when the provider does not say', () => {
    const reply = new AIMessage({
      content: 'hi',
      usage_metadata: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    });
    expect(readUsage(reply).cachedTokens).toBe(0);
  });
  it('flags a reply with no numbers as missing instead of inventing them', () => {
    expect(readUsage(new AIMessage('hi'))).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      usageMissing: true,
    });
  });
});
