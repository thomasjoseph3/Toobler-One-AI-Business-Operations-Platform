import { describe, expect, it } from 'vitest';
import type { SetupChatQuestion } from '@toobler-one/shared';
import {
  addQuestionLine,
  buildReplyText,
  canSendReply,
  isPickQuestion,
  toggleOption,
  type SetupChatLine,
} from './setup-chat-state';

const question = (overrides: Partial<SetupChatQuestion>): SetupChatQuestion => ({
  key: 'q',
  text: 'How do customers pay?',
  type: 'pick_several',
  options: ['UPI', 'Card', 'Cash'],
  allowOther: false,
  maxChoices: null,
  yesDetailLabel: null,
  neededToGoLive: false,
  ...overrides,
});

describe('setup chat replies', () => {
  it('knows which questions are answered by buttons', () => {
    expect(isPickQuestion(question({ type: 'pick_one' }))).toBe(true);
    expect(isPickQuestion(question({ type: 'pick_several' }))).toBe(true);
    expect(isPickQuestion(question({ type: 'short_text' }))).toBe(false);
  });

  it('cannot send an empty reply, and can send chosen options or typed words', () => {
    expect(canSendReply('   ', [])).toBe(false);
    expect(canSendReply('', ['UPI'])).toBe(true);
    expect(canSendReply('Nair Stays', [])).toBe(true);
  });

  it('builds the reply from the chosen options in the question’s order, then anything typed', () => {
    expect(buildReplyText(question({}), ['Cash', 'UPI'], '')).toBe('UPI, Cash');
    expect(buildReplyText(question({}), ['UPI'], ' crypto ')).toBe('UPI, crypto');
    expect(buildReplyText(question({ type: 'short_text', options: [] }), [], '  Nair Stays ')).toBe('Nair Stays');
  });

  it('keeps one option for a pick one, and up to the most allowed for a pick several', () => {
    const one = question({ type: 'pick_one' });
    expect(toggleOption(one, ['UPI'], 'Card')).toEqual(['Card']);
    expect(toggleOption(one, ['Card'], 'Card')).toEqual([]);
    const several = question({ maxChoices: 2 });
    expect(toggleOption(several, ['UPI'], 'Card')).toEqual(['UPI', 'Card']);
    expect(toggleOption(several, ['UPI', 'Card'], 'Cash')).toEqual(['UPI', 'Card']);
    expect(toggleOption(several, ['UPI', 'Card'], 'UPI')).toEqual(['Card']);
  });
});

describe('addQuestionLine', () => {
  const asked: SetupChatLine[] = [{ kind: 'question', text: 'How do customers pay?' }];

  it('adds a new question', () => {
    expect(addQuestionLine([], question({}))).toEqual(asked);
  });

  it('does not repeat the question that is already last when a reply could not be used', () => {
    const withProblem: SetupChatLine[] = [
      ...asked,
      { kind: 'reply', text: 'x' },
      { kind: 'problem', text: 'Could not read that' },
    ];
    expect(addQuestionLine(withProblem, question({}))).toEqual(withProblem);
  });

  it('asks the same words again after a reply that was saved (another question with the same words is still asked)', () => {
    const afterSaved: SetupChatLine[] = [...asked, { kind: 'reply', text: 'UPI' }];
    expect(addQuestionLine(afterSaved, question({}))).toHaveLength(3);
  });
});
