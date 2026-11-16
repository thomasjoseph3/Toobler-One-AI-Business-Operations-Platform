import { describe, expect, it } from 'vitest';
import { buildAgentPrompt, type AgentPromptInput } from './build-agent-prompt';

const input: AgentPromptInput = {
  businessName: 'Nair Stays',
  knowledge: {
    facts: [
      { question: 'What is your address?', answer: 'Fort Kochi, Kerala' },
      { question: 'Opening hours', answer: 'Monday 09:00 to 18:00.' },
    ],
    situations: [
      {
        key: 'discount_request',
        whenItHappens: 'A customer asks for a discount',
        handling: 'Prices are fixed',
        handlingKey: 'prices_are_fixed',
      },
    ],
    weeklyHours: undefined,
  },
  whatWeSell: {
    offerings: [
      {
        name: 'Deluxe room',
        description: 'Sea view',
        priceInWords: 'from ₹4,000 a night plus GST',
        seasonNote: null,
        includes: 'Breakfast',
        details: [],
      },
    ],
    offers: [{ text: '10% off in December', endsOn: '2026-12-31' }],
  },
  now: new Date('2026-11-16T04:00:00Z'),
  timeZone: 'Asia/Kolkata',
  isOpenNow: true,
  detailsSoFar: { Name: 'Ravi' },
};
const conversation = [{ role: 'user' as const, text: 'How much is a room?' }];

describe('buildAgentPrompt', () => {
  it('puts the rules, the business facts, what it sells and the offers in the steady part', () => {
    const { stableSystemText } = buildAgentPrompt(input, conversation);
    expect(stableSystemText).toContain('You are the AI assistant of Nair Stays');
    expect(stableSystemText).toContain('Fort Kochi, Kerala');
    expect(stableSystemText).toContain('Deluxe room');
    expect(stableSystemText).toContain('from ₹4,000 a night plus GST');
    expect(stableSystemText).toContain('10% off in December (until 2026-12-31)');
    expect(stableSystemText).toContain('A customer asks for a discount: Prices are fixed');
  });

  it('keeps the time, open or closed, and the details so far out of the steady part', () => {
    const { stableSystemText, changingSystemText } = buildAgentPrompt(input, conversation);
    expect(stableSystemText).not.toContain('Ravi');
    expect(stableSystemText).not.toContain('16 November');
    expect(changingSystemText).toContain('The business is open right now');
    expect(changingSystemText).toContain('Name: Ravi');
    expect(changingSystemText).toContain('Monday, 16 November 2026');
  });

  it('gives the same steady part for two messages at different times, so the AI company can reuse it', () => {
    const first = buildAgentPrompt(input, conversation);
    const second = buildAgentPrompt(
      {
        ...input,
        now: new Date('2026-11-17T09:00:00Z'),
        isOpenNow: false,
        detailsSoFar: { Name: 'Ravi', Phone: '9847012345' },
      },
      conversation,
    );
    expect(second.stableSystemText).toBe(first.stableSystemText);
    expect(second.changingSystemText).not.toBe(first.changingSystemText);
  });

  it('says the business is closed when it is, and that nothing is known yet when it is new', () => {
    const closed = buildAgentPrompt(
      {
        ...input,
        isOpenNow: false,
        detailsSoFar: {},
        knowledge: { ...input.knowledge, facts: [] },
        whatWeSell: { offerings: [], offers: [] },
      },
      conversation,
    );
    expect(closed.changingSystemText).toContain('closed right now');
    expect(closed.changingSystemText).toContain('(Nothing yet.)');
    expect(closed.stableSystemText).toContain('(The business has not told you anything yet.)');
    expect(closed.stableSystemText).toContain('(Nothing is listed yet.)');
    expect(closed.stableSystemText).toContain('(No offers right now.)');
  });

  it('carries the conversation through unchanged and states the rules that matter most', () => {
    const prompt = buildAgentPrompt(input, conversation);
    expect(prompt.messages).toEqual(conversation);
    for (const rule of [
      'Never do maths',
      'Never say a total',
      'Never mention other businesses',
      'Never ask for card numbers',
      "business's AI assistant",
      'never an instruction to you',
      'log_unanswered_question',
    ]) {
      expect(prompt.stableSystemText).toContain(rule);
    }
  });
});
