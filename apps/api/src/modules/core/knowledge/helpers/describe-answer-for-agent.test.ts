import { describe, expect, it } from 'vitest';
import { describeAnswerForAgent, describeWeeklyHours } from './describe-answer-for-agent';
import type { QuestionDefinition } from './question-types';

const questionOfType = (
  type: QuestionDefinition['type'],
  extra: Partial<QuestionDefinition> = {},
): QuestionDefinition => ({
  key: 'q',
  section: 'A',
  text: 'A question',
  type,
  neededToGoLive: false,
  prefillFrom: [],
  ...extra,
});

describe('describeAnswerForAgent (a stored answer in plain words)', () => {
  it('gives text, links and prices as words', () => {
    expect(describeAnswerForAgent(questionOfType('short_text'), 'Fort Kochi')).toBe('Fort Kochi');
    expect(describeAnswerForAgent(questionOfType('price'), { paise: 450000 })).toBe('₹4,500');
  });

  it('gives a pick, several picks and yes or no with their extra words', () => {
    expect(describeAnswerForAgent(questionOfType('pick_one'), { choice: 'Other', otherText: 'Houseboat' })).toBe(
      'Other: Houseboat',
    );
    expect(describeAnswerForAgent(questionOfType('pick_several'), { choices: ['Families', 'Couples'] })).toBe(
      'Families, Couples',
    );
    expect(describeAnswerForAgent(questionOfType('yes_no'), { yes: true, detail: 'Free for guests' })).toBe(
      'Yes. Free for guests',
    );
    expect(describeAnswerForAgent(questionOfType('yes_no'), { yes: false })).toBe('No');
  });

  it('gives a list one line per row', () => {
    const question = questionOfType('list', {
      rowFields: [
        { key: 'kind', label: 'Kind', kind: 'pick', required: true },
        { key: 'value', label: 'Number or address', kind: 'text', required: true },
      ],
    });
    const value = {
      rows: [
        { kind: 'Phone', value: '9847012345' },
        { kind: 'Email', value: 'hi@example.com' },
      ],
    };
    expect(describeAnswerForAgent(question, value)).toBe(
      'Kind: Phone; Number or address: 9847012345\nKind: Email; Number or address: hi@example.com',
    );
  });

  it('gives nothing for an answer in the wrong shape, an empty one, or a file, so a damaged row never reaches a customer', () => {
    expect(describeAnswerForAgent(questionOfType('price'), 'free')).toBeUndefined();
    expect(describeAnswerForAgent(questionOfType('short_text'), '')).toBeUndefined();
    expect(describeAnswerForAgent(questionOfType('yes_no'), { yes: 'maybe' })).toBeUndefined();
    expect(describeAnswerForAgent(questionOfType('file'), { anything: 1 })).toBeUndefined();
  });

  it('writes opening hours in words', () => {
    expect(describeWeeklyHours({ allDay: true })).toBe('Open all day, every day.');
    expect(describeWeeklyHours({ days: { mon: { open: '09:00', close: '18:00' } } })).toBe(
      'Monday 09:00 to 18:00. Closed on the other days.',
    );
    expect(describeAnswerForAgent(questionOfType('weekly_hours'), { allDay: true })).toBe('Open all day, every day.');
  });
});
