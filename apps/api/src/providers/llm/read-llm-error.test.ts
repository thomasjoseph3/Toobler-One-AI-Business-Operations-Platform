import { describe, expect, it } from 'vitest';
import { isDailyQuotaError, readLlmError } from './read-llm-error';

describe('readLlmError', () => {
  it('reads a rejected key', () => {
    expect(readLlmError(new Error('API key not valid. Please pass a valid API key.'))).toBe('bad_key');
    expect(readLlmError(new Error('401 Incorrect API key provided'))).toBe('bad_key');
    expect(readLlmError(new Error('PERMISSION_DENIED: API has not been enabled'))).toBe('bad_key');
  });
  it('reads a used-up quota or a rate limit', () => {
    expect(readLlmError(new Error('429 Too Many Requests'))).toBe('rate_limited');
    expect(readLlmError(new Error('RESOURCE_EXHAUSTED: quota exceeded for this model'))).toBe('rate_limited');
    expect(readLlmError(new Error('The model is overloaded'))).toBe('rate_limited');
    expect(readLlmError(new Error('[503 ] This model is currently experiencing high demand.'))).toBe('rate_limited');
  });
  it('reads a model the provider does not know (retired or renamed)', () => {
    expect(readLlmError(new Error('404 models/gemini-old is not found for API version v1'))).toBe('model_missing');
    expect(readLlmError(new Error('The model `gpt-old` does not exist or you do not have access to it'))).toBe(
      'model_missing',
    );
  });
  it('reads a call that was stopped for taking too long', () => {
    expect(readLlmError(new Error('The operation was aborted due to timeout'))).toBe('timed_out');
    expect(readLlmError(new Error('Request timed out.'))).toBe('timed_out');
  });
  it('calls anything else a plain error, and copes with text and non-errors', () => {
    expect(readLlmError(new Error('socket hang up'))).toBe('error');
    expect(readLlmError('boom')).toBe('error');
    expect(readLlmError(undefined)).toBe('error');
  });
  it('tells a daily quota from a short limit', () => {
    expect(isDailyQuotaError(new Error('Quota exceeded: requests per day'))).toBe(true);
    expect(isDailyQuotaError(new Error('Quota exceeded: requests per minute'))).toBe(false);
  });
});
