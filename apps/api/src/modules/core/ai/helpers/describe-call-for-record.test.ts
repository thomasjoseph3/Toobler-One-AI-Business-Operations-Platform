import { describe, expect, it } from 'vitest';
import type { LlmAttempt, LlmCallDetails } from '../../../../providers/llm';
import { describeCallForRecord } from './describe-call-for-record';

const tag = { task: 'chat_reply', agentId: 'email', channel: 'email', promptVersion: 'p-3', conversationId: 'conv-1' };
const attempt = (outcome: LlmAttempt['outcome'], modelName = 'm1'): LlmAttempt => ({
  provider: 'gemini',
  modelName,
  keySource: 'own',
  keyPosition: 2,
  outcome,
});
const answeredDetails: LlmCallDetails = {
  servedBy: { provider: 'gemini', modelName: 'm2', keySource: 'own', keyPosition: 2 },
  attempts: [attempt('rate_limited', 'm1'), attempt('ok', 'm2')],
  fallbackUsed: true,
  fallbackReason: 'rate_limited',
  usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 60, usageMissing: false },
  latencyMs: 850,
};

describe('describeCallForRecord', () => {
  it('describes an answered call by who answered, with tokens, fallback and every try', () => {
    const call = describeCallForRecord({
      accountId: 'acc',
      tag,
      details: answeredDetails,
      attempts: answeredDetails.attempts,
    });
    expect(call).toMatchObject({
      accountId: 'acc',
      task: 'chat_reply',
      agentId: 'email',
      channel: 'email',
      promptVersion: 'p-3',
      conversationId: 'conv-1',
      modelName: 'm2',
      keySource: 'own',
      keyPosition: 2,
      success: true,
      errorKind: null,
      attemptCount: 2,
      fallbackUsed: true,
      fallbackReason: 'rate_limited',
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 60,
      latencyMs: 850,
    });
    expect(call?.attempts).toEqual([
      { provider: 'gemini', modelName: 'm1', keySource: 'own', keyPosition: 2, outcome: 'rate_limited' },
      { provider: 'gemini', modelName: 'm2', keySource: 'own', keyPosition: 2, outcome: 'ok' },
    ]);
  });

  it('describes a failed call by its last try, with the reason, no tokens and no fallback claimed', () => {
    const attempts = [attempt('rate_limited', 'm1'), attempt('bad_key', 'm2')];
    const call = describeCallForRecord({ accountId: 'acc', tag, details: null, attempts });
    expect(call).toMatchObject({
      modelName: 'm2',
      success: false,
      errorKind: 'bad_key',
      attemptCount: 2,
      fallbackUsed: false,
      inputTokens: 0,
      latencyMs: null,
    });
  });

  it('has no conversation when there is none, and writes nothing when nothing was tried', () => {
    const { conversationId: _unused, ...tagWithoutConversation } = tag;
    expect(
      describeCallForRecord({
        accountId: 'a',
        tag: tagWithoutConversation,
        details: answeredDetails,
        attempts: answeredDetails.attempts,
      })?.conversationId,
    ).toBeNull();
    expect(describeCallForRecord({ accountId: 'a', tag, details: null, attempts: [] })).toBeNull();
  });

  it('never carries anything but positions and outcomes in the stored tries', () => {
    const call = describeCallForRecord({
      accountId: 'acc',
      tag,
      details: answeredDetails,
      attempts: answeredDetails.attempts,
    });
    for (const stored of call?.attempts ?? []) {
      expect(Object.keys(stored as object).sort()).toEqual([
        'keyPosition',
        'keySource',
        'modelName',
        'outcome',
        'provider',
      ]);
    }
  });
});
