import { describe, expect, it } from 'vitest';
import { chooseQuestionMerges, type QuestionToCompare } from './choose-question-merges';

/** Makes a question to compare, with sensible defaults. */
function question(overrides: Partial<QuestionToCompare> & { id: string }): QuestionToCompare {
  return {
    count: 1,
    lastAskedAt: new Date('2026-11-01T10:00:00Z'),
    createdAt: new Date('2026-10-01T10:00:00Z'),
    wordKey: 'avail park',
    ...overrides,
  };
}

describe('chooseQuestionMerges', () => {
  it('joins questions with the same meaningful words: the most asked stays and takes over the counts and the latest time', () => {
    const merges = chooseQuestionMerges([
      question({ id: 'a', count: 2, lastAskedAt: new Date('2026-11-02T10:00:00Z') }),
      question({ id: 'b', count: 5, lastAskedAt: new Date('2026-11-05T10:00:00Z') }),
      question({ id: 'c', count: 1, lastAskedAt: new Date('2026-11-03T10:00:00Z') }),
    ]);
    expect(merges).toEqual([
      { keeperId: 'b', absorbedIds: ['a', 'c'], totalCount: 8, lastAskedAt: new Date('2026-11-05T10:00:00Z') },
    ]);
  });

  it('keeps the oldest question when the counts are equal', () => {
    const merges = chooseQuestionMerges([
      question({ id: 'newer', createdAt: new Date('2026-10-05T10:00:00Z') }),
      question({ id: 'older', createdAt: new Date('2026-10-01T10:00:00Z') }),
    ]);
    expect(merges[0]).toMatchObject({ keeperId: 'older', absorbedIds: ['newer'] });
  });

  it('never joins different words, a lone question, or a question with no meaningful word', () => {
    const merges = chooseQuestionMerges([
      question({ id: 'a', wordKey: 'avail park' }),
      question({ id: 'b', wordKey: 'avail pool' }),
      question({ id: 'c', wordKey: '' }),
      question({ id: 'd', wordKey: '' }),
    ]);
    expect(merges).toEqual([]);
  });

  it('makes one merge per group of questions', () => {
    const merges = chooseQuestionMerges([
      question({ id: 'a1', wordKey: 'avail park', count: 2 }),
      question({ id: 'a2', wordKey: 'avail park' }),
      question({ id: 'b1', wordKey: 'charg ev', count: 3 }),
      question({ id: 'b2', wordKey: 'charg ev' }),
    ]);
    expect(merges.map((merge) => merge.keeperId).sort()).toEqual(['a1', 'b1']);
  });
});
