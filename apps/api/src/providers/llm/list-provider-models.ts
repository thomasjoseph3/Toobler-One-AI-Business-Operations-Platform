import type { LlmProviderId } from './llm-types';

// Asks an AI company which models a key can see. The addresses are fixed in code (never taken from input), the key goes in a
// header (never in the address, so it cannot end up in a log), and every call has a time limit.

const LIST_TIMEOUT_MS = 15_000;

/** The fetch function, replaceable in tests. */
export type FetchFunction = typeof fetch;

/** Reads the model names out of each company's answer. */
function readModelNames(provider: LlmProviderId, body: unknown): string[] {
  const record = (body ?? {}) as Record<string, unknown>;
  if (provider === 'gemini') {
    const models = Array.isArray(record.models) ? (record.models as Array<Record<string, unknown>>) : [];
    return models
      .filter(
        (model) =>
          Array.isArray(model.supportedGenerationMethods) &&
          model.supportedGenerationMethods.includes('generateContent'),
      )
      .map((model) => String(model.name ?? '').replace(/^models\//, ''))
      .filter((name) => name !== '');
  }
  const data = Array.isArray(record.data) ? (record.data as Array<Record<string, unknown>>) : [];
  return data.map((model) => String(model.id ?? '')).filter((name) => name !== '');
}

/** Lists the model names a company shows for a key. Throws (with the HTTP status, never the key) when the company says no. */
export async function listProviderModels(
  provider: LlmProviderId,
  apiKey: string,
  fetchFunction: FetchFunction = fetch,
): Promise<string[]> {
  const request =
    provider === 'gemini'
      ? {
          url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
          headers: { 'x-goog-api-key': apiKey },
        }
      : provider === 'openai'
        ? { url: 'https://api.openai.com/v1/models', headers: { authorization: `Bearer ${apiKey}` } }
        : {
            url: 'https://api.anthropic.com/v1/models?limit=1000',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          };
  const response = await fetchFunction(request.url, {
    headers: request.headers,
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`The AI company answered ${response.status} to the list of models`);
  return readModelNames(provider, await response.json());
}
