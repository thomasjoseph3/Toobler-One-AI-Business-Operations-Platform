import { describe, expect, it } from 'vitest';
import { computeProfileProgress } from './completeness';
import { GENERAL_QUESTIONS } from './general-questions';
import { getQuestionsForIndustry } from './question-set';

const confirmed = (questionKey: string) => ({ questionKey, status: 'confirmed' as const });
const waiting = (questionKey: string) => ({ questionKey, status: 'check' as const });

/** The questions needed to go live that can be answered here. */
const NEEDED_HERE = [
  'has_website',
  'business_name',
  'business_summary',
  'address',
  'contact_details',
  'opening_hours',
  'customer_languages',
];

describe('computeProfileProgress', () => {
  it('starts at zero and lists the needed questions first, then the rest in list order', () => {
    const progress = computeProfileProgress(GENERAL_QUESTIONS, []);
    expect(progress.answeredQuestions).toBe(0);
    expect(progress.percentComplete).toBe(0);
    expect(progress.readyToGoLive).toBe(false);
    expect(progress.neededToGoLiveStillMissing).toEqual(NEEDED_HERE);
    expect(progress.stillToAnswer.slice(0, NEEDED_HERE.length)).toEqual(NEEDED_HERE);
    expect(progress.stillToAnswer[NEEDED_HERE.length]).toBe('online_profiles'); // then the list order resumes
  });

  it('leaves out the questions answered in other features (offerings, FAQs, documents) everywhere', () => {
    const progress = computeProfileProgress(GENERAL_QUESTIONS, []);
    expect(progress.totalQuestions).toBe(GENERAL_QUESTIONS.length - 5);
    for (const key of ['offerings', 'prices_include_gst', 'current_offers', 'common_questions', 'brochure_upload']) {
      expect(progress.stillToAnswer).not.toContain(key);
    }
  });

  it('counts a question answered in another feature once that feature reports on it, answered exactly when it says so', () => {
    const notYet = computeProfileProgress(
      GENERAL_QUESTIONS,
      NEEDED_HERE.map(confirmed),
      new Map([['offerings', false]]),
    );
    expect(notYet.totalQuestions).toBe(GENERAL_QUESTIONS.length - 4); // "What do you sell?" now counts
    expect(notYet.readyToGoLive).toBe(false);
    expect(notYet.neededToGoLiveStillMissing).toEqual(['offerings']); // needed to go live, and not answered
    expect(notYet.stillToAnswer[0]).toBe('offerings');

    const done = computeProfileProgress(GENERAL_QUESTIONS, NEEDED_HERE.map(confirmed), new Map([['offerings', true]]));
    expect(done.readyToGoLive).toBe(true);
    expect(done.neededToGoLiveStillMissing).toEqual([]);
    expect(done.answeredQuestions).toBe(notYet.answeredQuestions + 1);
  });

  it('ignores what another feature says about a question that is not handled elsewhere, and about questions it was not asked', () => {
    const progress = computeProfileProgress(
      GENERAL_QUESTIONS,
      [],
      new Map([
        ['business_name', true],
        ['no_such_question', true],
      ]),
    );
    expect(progress.answeredQuestions).toBe(0);
    expect(progress.totalQuestions).toBe(GENERAL_QUESTIONS.length - 5);
  });

  it('is ready to go live exactly when every needed question has a confirmed answer', () => {
    const almost = computeProfileProgress(GENERAL_QUESTIONS, NEEDED_HERE.slice(1).map(confirmed));
    expect(almost.readyToGoLive).toBe(false);
    expect(almost.neededToGoLiveStillMissing).toEqual(['has_website']);
    const ready = computeProfileProgress(GENERAL_QUESTIONS, NEEDED_HERE.map(confirmed));
    expect(ready.readyToGoLive).toBe(true);
    expect(ready.neededToGoLiveStillMissing).toEqual([]);
    expect(ready.percentComplete).toBeGreaterThan(0);
    expect(ready.percentComplete).toBeLessThan(100);
  });

  it('counts only confirmed answers; one waiting for a check counts as waiting, not answered', () => {
    const progress = computeProfileProgress(GENERAL_QUESTIONS, [confirmed('business_name'), waiting('address')]);
    expect(progress.answeredQuestions).toBe(1);
    expect(progress.waitingForCheck).toBe(1);
    expect(progress.neededToGoLiveStillMissing).toContain('address');
  });

  it('reaches 100 percent only when everything that counts is confirmed', () => {
    const everything = GENERAL_QUESTIONS.filter((question) => !question.handledElsewhere).map((question) =>
      confirmed(question.key),
    );
    const progress = computeProfileProgress(GENERAL_QUESTIONS, everything);
    expect(progress).toMatchObject({ percentComplete: 100, readyToGoLive: true, stillToAnswer: [] });
  });

  it('rounds to a whole percent', () => {
    const progress = computeProfileProgress(GENERAL_QUESTIONS, [confirmed('business_name')]);
    expect(Number.isInteger(progress.percentComplete)).toBe(true);
    expect(progress.percentComplete).toBe(Math.round((1 / progress.totalQuestions) * 100));
  });

  it('ignores answers to questions that are not in the list', () => {
    const progress = computeProfileProgress(GENERAL_QUESTIONS, [confirmed('hotel_pets'), confirmed('nonsense')]);
    expect(progress.answeredQuestions).toBe(0);
  });

  it("counts an industry's extras in the total but never in the go-live check", () => {
    const hotel = getQuestionsForIndustry('hotel_resort');
    const progress = computeProfileProgress(hotel, []);
    expect(progress.totalQuestions).toBeGreaterThan(computeProfileProgress(GENERAL_QUESTIONS, []).totalQuestions);
    expect(progress.neededToGoLiveStillMissing).toEqual(NEEDED_HERE);
  });

  it('is complete for an empty list of questions', () => {
    expect(computeProfileProgress([], [])).toMatchObject({ percentComplete: 100, readyToGoLive: true });
  });
});
