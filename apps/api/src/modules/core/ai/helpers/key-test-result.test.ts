import { describe, expect, it } from 'vitest';
import type { LlmAttempt } from '../../../../providers/llm';
import { findingWhenKeyFails, findingWhenKeyWorks } from './key-test-result';

const attempt = (outcome: LlmAttempt['outcome']): LlmAttempt => ({
  provider: 'gemini',
  modelName: 'm',
  keySource: 'own',
  keyPosition: 1,
  outcome,
});

describe('key test findings', () => {
  it('says a key works, naming the model and the time', () => {
    expect(findingWhenKeyWorks('gemini-flash-lite-latest', 1300)).toEqual({
      outcome: 'works',
      status: 'working',
      note: 'Answered using gemini-flash-lite-latest in 1300 ms.',
    });
  });

  it('calls a rejected key failed, even when other tries met other problems', () => {
    const finding = findingWhenKeyFails([attempt('rate_limited'), attempt('bad_key'), attempt('error')]);
    expect(finding).toMatchObject({ outcome: 'rejected', status: 'failed' });
  });

  it('calls a used-up quota limited', () => {
    expect(findingWhenKeyFails([attempt('model_missing'), attempt('rate_limited')])).toMatchObject({
      outcome: 'quota',
      status: 'limited',
    });
  });

  it('calls a key with no usable model failed only when every try said the model is missing', () => {
    expect(findingWhenKeyFails([attempt('model_missing'), attempt('model_missing')])).toMatchObject({
      outcome: 'no_model',
      status: 'failed',
    });
    expect(findingWhenKeyFails([attempt('model_missing'), attempt('error')])).toMatchObject({ outcome: 'unreachable' });
  });

  it('leaves the status alone when the test could not tell (timeout, network, nothing tried)', () => {
    expect(findingWhenKeyFails([attempt('timed_out'), attempt('error')])).toMatchObject({
      outcome: 'unreachable',
      status: null,
    });
    expect(findingWhenKeyFails([])).toMatchObject({ outcome: 'unreachable', status: null });
  });

  it('keeps every note short enough for the database and free of anything from the company', () => {
    for (const finding of [
      findingWhenKeyWorks('some-model-name', 99999),
      findingWhenKeyFails([attempt('bad_key')]),
      findingWhenKeyFails([attempt('rate_limited')]),
      findingWhenKeyFails([attempt('model_missing')]),
      findingWhenKeyFails([]),
    ]) {
      expect(finding.note.length).toBeLessThanOrEqual(300);
    }
  });
});
