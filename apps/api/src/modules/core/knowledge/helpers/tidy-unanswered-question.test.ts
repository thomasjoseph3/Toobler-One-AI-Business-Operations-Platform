import { describe, expect, it } from 'vitest';
import { blankOutPersonalDetails, makeGroupKey, tidyUnansweredQuestion } from './tidy-unanswered-question';

describe('blankOutPersonalDetails', () => {
  it('blanks out emails and phone numbers, in any common format', () => {
    expect(blankOutPersonalDetails('mail me at asha@example.com please')).toBe('mail me at [email] please');
    expect(blankOutPersonalDetails('call +91 98765 43210 now')).toBe('call [number] now');
    expect(blankOutPersonalDetails('call 98765-43210')).toBe('call [number]');
    expect(blankOutPersonalDetails('my number is (044) 2345 6789')).toBe('my number is [number]');
  });

  it('keeps small numbers such as a quantity or a year', () => {
    expect(blankOutPersonalDetails('a room for 2 people for 4 nights')).toBe('a room for 2 people for 4 nights');
    expect(blankOutPersonalDetails('open in 2027?')).toBe('open in 2027?');
  });
});

describe('makeGroupKey', () => {
  it('ignores capitals, punctuation and extra spaces', () => {
    expect(makeGroupKey('Is there EV  charging?')).toBe('is there ev charging');
    expect(makeGroupKey('is there ev charging')).toBe('is there ev charging');
  });

  it('keeps letters of other scripts', () => {
    expect(makeGroupKey('പാർക്കിംഗ് ഉണ്ടോ?')).toBe('പാർക്കിംഗ് ഉണ്ടോ');
  });
});

describe('tidyUnansweredQuestion', () => {
  it('tidies the spaces, blanks out personal details and gives the group key', () => {
    expect(tidyUnansweredQuestion('  Can you   call 9876543210? ')).toEqual({
      question: 'Can you call [number]?',
      groupKey: 'can you call number',
    });
  });

  it('cuts a very long question to 300 characters', () => {
    const tidied = tidyUnansweredQuestion('a'.repeat(500));
    expect(tidied?.question).toHaveLength(300);
  });

  it('gives null when nothing meaningful is left', () => {
    expect(tidyUnansweredQuestion('')).toBeNull();
    expect(tidyUnansweredQuestion('   ')).toBeNull();
    expect(tidyUnansweredQuestion('???')).toBeNull();
  });
});
