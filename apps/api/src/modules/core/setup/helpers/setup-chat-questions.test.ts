import { describe, expect, it } from 'vitest';
import type { KnowledgeQuestion } from '@toobler-one/shared';
import { chooseNextChatQuestion, countFormOnlyQuestions, isChatQuestion } from './setup-chat-questions';

function question(overrides: Partial<KnowledgeQuestion> & { key: string }): KnowledgeQuestion {
  return {
    section: 'A',
    text: `Question ${overrides.key}`,
    type: 'short_text',
    options: null,
    allowOther: false,
    maxChoices: null,
    yesDetail: null,
    rowFields: null,
    maxRows: null,
    neededToGoLive: false,
    handledElsewhere: null,
    elsewhereStatus: null,
    usedFor: null,
    answer: null,
    ...overrides,
  };
}
const answered = { value: 'x', source: 'typed', status: 'confirmed', confirmedAt: null, updatedAt: '' } as const;

describe('isChatQuestion', () => {
  it('takes text, link, pick and yes/no questions, and leaves hours, lists, prices, files and questions answered elsewhere', () => {
    for (const type of ['short_text', 'long_text', 'link', 'pick_one', 'pick_several', 'yes_no'] as const) {
      expect(isChatQuestion(question({ key: 'q', type }))).toBe(true);
    }
    for (const type of ['weekly_hours', 'list', 'price', 'file'] as const) {
      expect(isChatQuestion(question({ key: 'q', type }))).toBe(false);
    }
    expect(isChatQuestion(question({ key: 'q', handledElsewhere: 'faqs' }))).toBe(false);
  });
});

describe('chooseNextChatQuestion', () => {
  const list = [
    question({ key: 'a', answer: answered }),
    question({ key: 'b', type: 'weekly_hours' }),
    question({ key: 'c' }),
    question({ key: 'd' }),
  ];

  it('asks the first unanswered question the chat can ask, in the profile order', () => {
    expect(chooseNextChatQuestion(list, new Set())?.key).toBe('c');
  });

  it('skips the questions the owner skipped, and says null when nothing is left', () => {
    expect(chooseNextChatQuestion(list, new Set(['c']))?.key).toBe('d');
    expect(chooseNextChatQuestion(list, new Set(['c', 'd']))).toBeNull();
  });

  it('counts an answer waiting for a check as answered', () => {
    const waiting = { ...answered, status: 'waiting_for_check' } as unknown as KnowledgeQuestion['answer'];
    expect(chooseNextChatQuestion([question({ key: 'a', answer: waiting })], new Set())).toBeNull();
  });
});

describe('countFormOnlyQuestions', () => {
  it('counts unanswered questions that are easier in the form, not those answered elsewhere or already answered', () => {
    const list = [
      question({ key: 'a', type: 'weekly_hours' }),
      question({ key: 'b', type: 'list' }),
      question({ key: 'c', type: 'list', answer: answered }),
      question({ key: 'd', type: 'file', handledElsewhere: 'documents' }),
      question({ key: 'e' }),
    ];
    expect(countFormOnlyQuestions(list)).toBe(2);
  });
});
