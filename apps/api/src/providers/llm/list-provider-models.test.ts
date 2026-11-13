import { describe, expect, it } from 'vitest';
import { listProviderModels, type FetchFunction } from './list-provider-models';

/** A pretend fetch that answers with JSON and remembers what it was asked. */
function fakeFetch(status: number, body: unknown) {
  const asked: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchFunction: FetchFunction = async (url, init) => {
    asked.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFunction, asked };
}

describe('listProviderModels', () => {
  it('reads Gemini’s list: only models that can generate, without the models/ prefix, key in a header', async () => {
    const { fetchFunction, asked } = fakeFetch(200, {
      models: [
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    expect(await listProviderModels('gemini', 'secret-gemini-key', fetchFunction)).toEqual(['gemini-3.5-flash']);
    expect(asked[0]?.url).toContain('generativelanguage.googleapis.com');
    expect(asked[0]?.url).not.toContain('secret-gemini-key');
    expect(asked[0]?.headers['x-goog-api-key']).toBe('secret-gemini-key');
  });

  it('reads OpenAI’s and Claude’s lists, with the key in a header', async () => {
    const openai = fakeFetch(200, { data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-5' }] });
    expect(await listProviderModels('openai', 'secret-openai-key', openai.fetchFunction)).toEqual([
      'gpt-4o-mini',
      'gpt-5',
    ]);
    expect(openai.asked[0]?.headers.authorization).toBe('Bearer secret-openai-key');
    expect(openai.asked[0]?.url).not.toContain('secret-openai-key');
    const claude = fakeFetch(200, { data: [{ id: 'claude-haiku-5-5' }] });
    expect(await listProviderModels('anthropic', 'secret-claude-key', claude.fetchFunction)).toEqual([
      'claude-haiku-5-5',
    ]);
    expect(claude.asked[0]?.headers['x-api-key']).toBe('secret-claude-key');
  });

  it('throws with the status but never the key when the company says no', async () => {
    const { fetchFunction } = fakeFetch(401, { error: 'bad key secret-openai-key' });
    const error = await listProviderModels('openai', 'secret-openai-key', fetchFunction).catch(
      (caught: unknown) => caught,
    );
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain('secret-openai-key');
  });

  it('copes with an answer that has no list', async () => {
    expect(await listProviderModels('gemini', 'k', fakeFetch(200, {}).fetchFunction)).toEqual([]);
    expect(await listProviderModels('openai', 'k', fakeFetch(200, { data: 'nope' }).fetchFunction)).toEqual([]);
  });
});
