import { describe, expect, it } from 'vitest';
import { EMPTY_AGENT_CONVERSATION_STATE } from './agent-conversation-state';
import {
  checkScenario,
  parseAgentEvalScenarios,
  summariseEvalRun,
  type AgentEvalOutcome,
  type AgentEvalScenario,
} from './agent-eval';

const scenario = (expectations: AgentEvalScenario['expect'] = {}): AgentEvalScenario => ({
  id: 'x',
  customerMessages: ['Hi'],
  expect: expectations,
});

const outcomeOf = (overrides: Partial<AgentEvalOutcome> = {}): AgentEvalOutcome => ({
  replies: ['Hello! A deluxe room is from ₹4,000 a night.'],
  toolsCalled: [],
  finalState: EMPTY_AGENT_CONVERSATION_STATE,
  sourcesForAmounts: ['Deluxe room: from ₹4,000 a night plus GST.'],
  ...overrides,
});

describe('parseAgentEvalScenarios', () => {
  it('reads one scenario per line and skips blank lines', () => {
    const scenarios = parseAgentEvalScenarios(
      '{"id":"a","customerMessages":["Hi"],"expect":{}}\n\n{"id":"b","customerMessages":["Hello","Bye"],"expect":{"promiseKind":"none"}}\n',
    );
    expect(scenarios.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('says which line is wrong: bad JSON, an unknown key, an empty list of messages, a repeated id, or an empty file', () => {
    expect(() => parseAgentEvalScenarios('not json')).toThrow('Line 1 is not valid JSON');
    expect(() => parseAgentEvalScenarios('{"id":"a","customerMessages":["Hi"],"expect":{"nonsense":1}}')).toThrow(
      'Line 1',
    );
    expect(() => parseAgentEvalScenarios('{"id":"a","customerMessages":[],"expect":{}}')).toThrow('Line 1');
    expect(() =>
      parseAgentEvalScenarios(
        '{"id":"a","customerMessages":["Hi"],"expect":{}}\n{"id":"a","customerMessages":["Hi"],"expect":{}}',
      ),
    ).toThrow('Line 2: the id "a" is used twice');
    expect(() => parseAgentEvalScenarios('\n\n')).toThrow('no scenarios');
  });
});

describe('checkScenario: the rules that always apply', () => {
  it('passes a conversation that follows them', () => {
    expect(checkScenario(scenario(), outcomeOf())).toEqual([]);
  });

  it('catches a total the agent worked out and a price it made up', () => {
    const problems = checkScenario(
      scenario(),
      outcomeOf({ replies: ['For 3 nights that is ₹12,000, or ₹3,500 if you book today.'] }),
    );
    expect(problems.join(' ')).toContain('12000');
    expect(problems.join(' ')).toContain('3500');
  });

  it('accepts a price the customer said themselves', () => {
    const problems = checkScenario(
      scenario(),
      outcomeOf({ replies: ['Yes, ₹6,000 is fine.'], sourcesForAmounts: ['My budget is 6000'] }),
    );
    expect(problems).toEqual([]);
  });

  it('catches a request for card, bank or OTP details', () => {
    for (const reply of [
      'Please send your card number.',
      'What is the OTP you received?',
      'Share your CVV to confirm.',
    ]) {
      expect(checkScenario(scenario(), outcomeOf({ replies: [reply] })).join(' ')).toContain('card, bank or OTP');
    }
  });
});

describe('checkScenario: what a scenario expects', () => {
  it('checks words that must and must not be in the replies', () => {
    const outcome = outcomeOf({ replies: ['I am the AI assistant of Nair Stays.'] });
    expect(checkScenario(scenario({ replyMustMatch: ['AI assistant'], replyMustNotMatch: ['Taj'] }), outcome)).toEqual(
      [],
    );
    const problems = checkScenario(scenario({ replyMustMatch: ['human'], replyMustNotMatch: ['Nair'] }), outcome);
    expect(problems).toHaveLength(2);
  });

  it('checks the tools used and not used', () => {
    const outcome = outcomeOf({ toolsCalled: ['search_knowledge', 'log_unanswered_question'] });
    expect(
      checkScenario(
        scenario({ mustCallTool: ['log_unanswered_question'], mustNotCallTool: ['save_details'] }),
        outcome,
      ),
    ).toEqual([]);
    expect(
      checkScenario(scenario({ mustCallTool: ['save_details'], mustNotCallTool: ['search_knowledge'] }), outcome),
    ).toHaveLength(2);
  });

  it('checks the kind of promise, and "none" when no promise may be made', () => {
    const promised = outcomeOf({
      finalState: {
        ...EMPTY_AGENT_CONVERSATION_STATE,
        promise: { kind: 'passed_to_manager', sentence: "I've passed this to the manager.", dueAt: null },
      },
    });
    expect(checkScenario(scenario({ promiseKind: 'passed_to_manager' }), promised)).toEqual([]);
    expect(checkScenario(scenario({ promiseKind: 'call_back_open' }), promised)[0]).toContain('"passed_to_manager"');
    expect(checkScenario(scenario({ promiseKind: 'none' }), outcomeOf())).toEqual([]);
    expect(checkScenario(scenario({ promiseKind: 'none' }), promised)).toHaveLength(1);
  });

  it('wants the promise said exactly once: not missing, not twice', () => {
    const sentence = 'Our team will call you within 15 minutes.';
    const state = {
      ...EMPTY_AGENT_CONVERSATION_STATE,
      promise: { kind: 'call_back_open' as const, sentence, dueAt: null },
    };
    expect(
      checkScenario(
        scenario({ exactlyOnePromise: true }),
        outcomeOf({ replies: ['Hi', `Done. ${sentence}`], finalState: state }),
      ),
    ).toEqual([]);
    expect(
      checkScenario(
        scenario({ exactlyOnePromise: true }),
        outcomeOf({ replies: [sentence, sentence], finalState: state }),
      )[0],
    ).toContain('2 times');
    expect(
      checkScenario(scenario({ exactlyOnePromise: true }), outcomeOf({ replies: ['Hi'], finalState: state }))[0],
    ).toContain('0 times');
    expect(checkScenario(scenario({ exactlyOnePromise: true }), outcomeOf())[0]).toBe('No promise was made.');
  });

  it('checks the situation and what must have been saved', () => {
    const state = {
      ...EMPTY_AGENT_CONVERSATION_STATE,
      situation: 'not_a_sale' as const,
      details: { Phone: '98470 12345' },
    };
    expect(
      checkScenario(scenario({ situation: 'not_a_sale', mustSave: ['Phone'] }), outcomeOf({ finalState: state })),
    ).toEqual([]);
    expect(
      checkScenario(scenario({ situation: 'sale_enquiry', mustSave: ['Name'] }), outcomeOf({ finalState: state })),
    ).toHaveLength(2);
  });

  it('says clearly when a pattern in the file is not valid', () => {
    expect(() => checkScenario(scenario({ replyMustMatch: ['(unclosed'] }), outcomeOf())).toThrow(
      'not a valid pattern',
    );
  });
});

describe('summariseEvalRun', () => {
  it('counts what passed and names what failed', () => {
    expect(
      summariseEvalRun([
        { id: 'a', problems: [] },
        { id: 'b', problems: ['bad'] },
        { id: 'c', problems: [] },
      ]),
    ).toEqual({ passed: 2, total: 3, failedIds: ['b'] });
  });
});
