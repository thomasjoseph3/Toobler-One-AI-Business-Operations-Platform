import { describe, expect, it } from 'vitest';
import type { Faq, UnansweredQuestion } from '@toobler-one/shared';
import { buildCreateFaqRequest, buildUpdateFaqRequest, checkFaqForm, EMPTY_FAQ_FORM, formFromFaq, tidyQuestion } from './faq-form';
import { describeAskedTimes, formatAskedDate, isWaitingForCheck, sortOpenQuestions } from './unanswered-state';

const faq = (changes: Partial<Faq> = {}): Faq => ({
  id: '0191f0a0-0000-7000-8000-000000000001',
  question: 'Do you have parking?',
  answer: 'Yes, free parking for guests.',
  status: 'confirmed',
  source: 'typed',
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
  ...changes,
});

describe('checkFaqForm', () => {
  it('needs a question and an answer, and keeps them within the limits', () => {
    expect(checkFaqForm(EMPTY_FAQ_FORM)).toEqual({ question: 'Type the question a customer would ask.', answer: 'Type the answer.' });
    expect(checkFaqForm({ question: 'Pets?', answer: 'Yes' })).toEqual({});
    expect(checkFaqForm({ question: 'x'.repeat(301), answer: 'y' }).question).toContain('300');
    expect(checkFaqForm({ question: 'q', answer: 'y'.repeat(2001) }).answer).toContain('2000');
  });

  it('counts the question after tidying, as the API does', () => {
    expect(checkFaqForm({ question: `  ${'a '.repeat(100)}  `, answer: 'x' })).toEqual({});
  });
});

describe('requests', () => {
  it('tidies the question and trims the answer but keeps the answer’s line breaks', () => {
    expect(tidyQuestion('  Do   you\nhave   parking?  ')).toBe('Do you have parking?');
    expect(buildCreateFaqRequest({ question: '  Pets   allowed? ', answer: ' Yes.\nOn a lead. ' })).toEqual({ question: 'Pets allowed?', answer: 'Yes.\nOn a lead.' });
  });

  it('sends only what changed, and nothing when the form is unchanged', () => {
    const original = faq();
    expect(buildUpdateFaqRequest(original, formFromFaq(original))).toEqual({});
    expect(buildUpdateFaqRequest(original, { ...formFromFaq(original), answer: 'Yes, and EV charging.' })).toEqual({ answer: 'Yes, and EV charging.' });
    expect(buildUpdateFaqRequest(original, { question: 'Is there parking?', answer: original.answer })).toEqual({ question: 'Is there parking?' });
  });
});

describe('unanswered questions and FAQs', () => {
  it('says how many times a question was asked', () => {
    expect(describeAskedTimes(1)).toEqual({ key: 'faqs.asked.once', count: 1 });
    expect(describeAskedTimes(4)).toEqual({ key: 'faqs.asked.many', count: 4 });
  });

  it('knows which FAQs wait for a check', () => {
    expect(isWaitingForCheck(faq({ status: 'check' }))).toBe(true);
    expect(isWaitingForCheck(faq())).toBe(false);
  });

  it('puts the most asked first and keeps the order of ties', () => {
    const question = (id: string, count: number): UnansweredQuestion => ({ id, question: id, count, lastAskedAt: '2026-11-17T10:00:00.000Z', status: 'open', faqId: null, createdAt: '2026-11-17T10:00:00.000Z' });
    expect(sortOpenQuestions([question('a', 1), question('b', 3), question('c', 3), question('d', 2)]).map((item) => item.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('shows the date in the business’s time zone', () => {
    expect(formatAskedDate('2026-11-17T20:00:00.000Z', 'Asia/Kolkata')).toBe('18 Nov 2026'); // already the next day in India
    expect(formatAskedDate('2026-11-17T20:00:00.000Z', 'America/New_York')).toBe('17 Nov 2026');
  });
});
