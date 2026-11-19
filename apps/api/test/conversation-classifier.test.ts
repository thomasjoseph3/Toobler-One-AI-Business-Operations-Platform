import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { createConversationClassifier } from '../src/modules/core/conversations/services/conversation-classifier.service';

/** A pretend AI service: remembers what it was asked and answers with the value it was given (after checking it fits the shape). */
function pretendAiService(answer: unknown) {
  const calls: Array<{ input: Parameters<ReturnType<typeof createFakeShape>['generateObject']>[0] }> = [];
  function createFakeShape() {
    return {
      async generateObject<Value>(
        input: {
          accountId: string;
          tag: Record<string, unknown>;
          prompt: {
            stableSystemText: string;
            changingSystemText?: string;
            messages: Array<{ role: string; text: string }>;
          };
          temperature?: number;
          maxOutputTokens?: number;
        },
        schema: ZodType<Value>,
      ) {
        calls.push({ input });
        return {
          value: schema.parse(answer),
          details: {
            servedBy: {
              provider: 'gemini',
              modelName: 'gemini-flash-lite-latest',
              keySource: 'platform',
              keyPosition: 1,
            },
          },
        } as never;
      },
    };
  }
  return { service: createFakeShape(), calls };
}

const types = [
  { key: 'new_enquiry', label: 'New enquiry', description: 'Wants to buy.', examples: [] },
  { key: 'complaint', label: 'Complaint', description: 'Unhappy.', examples: [] },
];

describe('createConversationClassifier', () => {
  it("asks for the job classify_conversation at temperature 0 and gives the answer in the router's words", async () => {
    const { service, calls } = pretendAiService({
      primary: { type: 'complaint', confidence: 0.9 },
      secondary: [{ type: 'new_enquiry', confidence: 0.6 }],
      needsPerson: true,
      reason: 'Unhappy and asked a price.',
    });
    const classifier = createConversationClassifier({ aiService: service as never });
    const result = await classifier.classifyConversation({
      accountId: 'account-1',
      channel: 'whatsapp',
      conversationId: 'conversation-1',
      types,
      transcript: [{ speaker: 'customer', text: 'The AC is broken. Also what is the price for March?' }],
      facts: { hasOpenLead: false },
    });

    expect(result.classification).toEqual({
      primary: { typeKey: 'complaint', confidence: 0.9 },
      secondary: [{ typeKey: 'new_enquiry', confidence: 0.6 }],
      needsPerson: true,
    });
    expect(result.reason).toBe('Unhappy and asked a price.');
    expect(result.servedBy.modelName).toBe('gemini-flash-lite-latest');

    const asked = calls[0]!.input;
    expect(asked.accountId).toBe('account-1');
    expect(asked.tag).toEqual({
      task: 'classify_conversation',
      agentId: 'classifier',
      channel: 'whatsapp',
      promptVersion: 'classifier-1',
      conversationId: 'conversation-1',
    });
    expect(asked.temperature).toBe(0);
  });

  it('puts the types in the steady part, the facts in the changing part, and the conversation only in the message', async () => {
    const { service, calls } = pretendAiService({
      primary: { type: 'new_enquiry', confidence: 0.9 },
      secondary: [],
      needsPerson: false,
      reason: 'Asks about a room.',
    });
    const classifier = createConversationClassifier({ aiService: service as never });
    await classifier.classifyConversation({
      accountId: 'account-1',
      channel: 'webchat',
      types,
      transcript: [{ speaker: 'customer', text: 'SECRET-CUSTOMER-WORDS' }],
      facts: { isExistingContact: true },
    });
    const { prompt } = calls[0]!.input;
    expect(prompt.stableSystemText).toContain('new_enquiry');
    expect(prompt.stableSystemText).toContain('complaint');
    expect(prompt.stableSystemText).not.toContain('SECRET-CUSTOMER-WORDS');
    expect(prompt.changingSystemText).toContain('already a contact');
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0]!.text).toContain('SECRET-CUSTOMER-WORDS');
  });

  it('leaves out the changing part when no facts are known, and tags a conversation with no id as none', async () => {
    const { service, calls } = pretendAiService({
      primary: { type: 'new_enquiry', confidence: 0.9 },
      secondary: [],
      needsPerson: false,
      reason: 'Asks.',
    });
    await createConversationClassifier({ aiService: service as never }).classifyConversation({
      accountId: 'account-1',
      channel: 'webchat',
      types,
      transcript: [{ speaker: 'customer', text: 'hi' }],
    });
    expect('changingSystemText' in calls[0]!.input.prompt).toBe(false);
    expect(calls[0]!.input.tag.conversationId).toBeNull();
  });

  it('refuses an answer that names a type the business does not have', async () => {
    const { service } = pretendAiService({
      primary: { type: 'made_up', confidence: 0.9 },
      secondary: [],
      needsPerson: false,
      reason: 'x',
    });
    await expect(
      createConversationClassifier({ aiService: service as never }).classifyConversation({
        accountId: 'account-1',
        channel: 'webchat',
        types,
        transcript: [{ speaker: 'customer', text: 'hi' }],
      }),
    ).rejects.toThrow();
  });
});
