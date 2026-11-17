import { describe, expect, it } from 'vitest';
import type { KnowledgeQuestion, PrefillRun } from '@toobler-one/shared';
import {
  describeQuestionState,
  describeReading,
  findWaitingQuestionKeys,
  groupQuestionsBySection,
  nextReadingCheckDelayMilliseconds,
  SECTION_ORDER,
} from './profile-state';

const question = (changes: Partial<KnowledgeQuestion>): KnowledgeQuestion => ({
  key: 'q',
  section: 'B',
  text: 'Q?',
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
  ...changes,
});
const answer = (status: 'check' | 'confirmed') => ({
  value: 'x',
  source: 'website' as const,
  status,
  confirmedAt: status === 'confirmed' ? '2026-11-17T10:00:00.000Z' : null,
  updatedAt: '2026-11-17T10:00:00.000Z',
});

describe('groupQuestionsBySection', () => {
  it('groups in the owner’s order and leaves out empty sections', () => {
    const groups = groupQuestionsBySection([
      question({ key: 'a', section: 'C' }),
      question({ key: 'b', section: 'A' }),
      question({ key: 'c', section: 'C' }),
      question({ key: 'd', section: 'extra' }),
    ]);
    expect(groups.map((group) => group.section)).toEqual(['A', 'C', 'extra']);
    expect(groups[1]!.questions.map((item) => item.key)).toEqual(['a', 'c']);
    expect(SECTION_ORDER).toEqual(['A', 'B', 'C', 'D', 'F', 'G', 'H', 'extra']);
  });
});

describe('describeQuestionState', () => {
  it('tells waiting, answered, unanswered and answered-elsewhere apart', () => {
    expect(describeQuestionState(question({}))).toBe('unanswered');
    expect(describeQuestionState(question({ answer: answer('check') }))).toBe('waiting');
    expect(describeQuestionState(question({ answer: answer('confirmed') }))).toBe('answered');
    expect(describeQuestionState(question({ handledElsewhere: 'offerings', elsewhereStatus: 'done' }))).toBe(
      'elsewhere_done',
    );
    expect(describeQuestionState(question({ handledElsewhere: 'offerings', elsewhereStatus: 'not_done' }))).toBe(
      'elsewhere_open',
    );
    expect(describeQuestionState(question({ handledElsewhere: 'faqs', elsewhereStatus: 'not_tracked' }))).toBe(
      'elsewhere_open',
    );
  });

  it('finds the answers waiting for a Yes', () => {
    expect(
      findWaitingQuestionKeys([
        question({ key: 'a', answer: answer('check') }),
        question({ key: 'b', answer: answer('confirmed') }),
        question({ key: 'c', answer: answer('check') }),
      ]),
    ).toEqual(['a', 'c']);
  });
});

const run = (changes: Partial<PrefillRun>): PrefillRun => ({
  id: '0191f0a0-0000-7000-8000-000000000009',
  status: 'queued',
  websiteUrl: 'https://a.example/',
  googleListing: null,
  errorCode: null,
  errorMessage: null,
  pagesRead: 0,
  answersFound: [],
  answersSkipped: 0,
  suggestedOfferings: [],
  createdAt: '2026-11-17T10:00:00.000Z',
  finishedAt: null,
  ...changes,
});

describe('describeReading', () => {
  it('says working while queued or reading', () => {
    expect(describeReading(run({ status: 'queued' }))).toEqual({ kind: 'working' });
    expect(describeReading(run({ status: 'reading' }))).toEqual({ kind: 'working' });
  });

  it('says what was found, with a warning when part of it failed', () => {
    expect(
      describeReading(
        run({
          status: 'done',
          pagesRead: 3,
          answersFound: ['a', 'b'],
          answersSkipped: 1,
          errorMessage: 'The AI could not answer just now.',
        }),
      ),
    ).toEqual({
      kind: 'done',
      answersFound: 2,
      answersSkipped: 1,
      pagesRead: 3,
      suggestionCount: 0,
      warning: 'The AI could not answer just now.',
    });
  });

  it('says why a reading failed, in the words the API gave', () => {
    expect(describeReading(run({ status: 'failed', errorMessage: 'The website took too long to answer.' }))).toEqual({
      kind: 'failed',
      message: 'The website took too long to answer.',
    });
    expect(describeReading(run({ status: 'failed' })).kind).toBe('failed');
  });
});

describe('nextReadingCheckDelayMilliseconds', () => {
  it('asks quickly at first, then more slowly, then gives up', () => {
    expect(nextReadingCheckDelayMilliseconds(0)).toBe(1000);
    expect(nextReadingCheckDelayMilliseconds(10)).toBe(2000);
    expect(nextReadingCheckDelayMilliseconds(90)).toBeNull();
  });
});
