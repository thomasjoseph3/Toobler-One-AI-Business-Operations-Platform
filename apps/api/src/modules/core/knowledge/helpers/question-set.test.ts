import { questionSectionSchema, situationKeySchema, answerTypeSchema } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { GENERAL_QUESTIONS } from './general-questions';
import { INDUSTRY_QUESTIONS } from './industry-questions';
import type { QuestionDefinition } from './question-types';
import { findQuestionForIndustry, getQuestionsForIndustry } from './question-set';
import { defaultChoiceKey, findSituation, SITUATIONS } from './situations';
import { onlyConfirmedAnswers } from './usable-answers';

const everyQuestion: QuestionDefinition[] = [...GENERAL_QUESTIONS, ...Object.values(INDUSTRY_QUESTIONS).flat()];

describe('the question list', () => {
  it('gives every question a different key, in the shape the database accepts', () => {
    const keys = everyQuestion.map((question) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
  });

  it('uses only known sections and answer types', () => {
    for (const question of everyQuestion) {
      expect(questionSectionSchema.safeParse(question.section).success, question.key).toBe(true);
      expect(answerTypeSchema.safeParse(question.type).success, question.key).toBe(true);
    }
  });

  it('gives every pick question its options, every list its columns, and nothing a type cannot use', () => {
    for (const question of everyQuestion) {
      if (question.type === 'pick_one' || question.type === 'pick_several') {
        expect(question.options?.length, question.key).toBeGreaterThan(1);
      } else {
        expect(question.options, question.key).toBeUndefined();
      }
      if (question.type === 'list' && !question.handledElsewhere) {
        expect(question.rowFields?.length, question.key).toBeGreaterThan(0);
      }
      if (question.type !== 'yes_no') expect(question.yesDetail, question.key).toBeUndefined();
      for (const field of question.rowFields ?? []) {
        if (field.kind === 'pick') expect(field.options?.length, `${question.key}.${field.key}`).toBeGreaterThan(1);
      }
    }
  });

  it('has the general questions of the requirement, in sections A, B, C, D, F, G and H', () => {
    const sections = new Set(GENERAL_QUESTIONS.map((question) => question.section));
    expect([...sections].sort()).toEqual(['A', 'B', 'C', 'D', 'F', 'G', 'H']);
    expect(GENERAL_QUESTIONS).toHaveLength(26);
  });

  it('needs for going live exactly the questions the requirement marks "Yes" that can be answered here', () => {
    const needed = GENERAL_QUESTIONS.filter((question) => question.neededToGoLive).map((question) => question.key);
    expect(needed).toEqual([
      'has_website',
      'business_name',
      'business_summary',
      'address',
      'contact_details',
      'opening_hours',
      'customer_languages',
      'offerings', // needed, but answered in the offerings feature, so left out of the go-live check until it exists
    ]);
  });

  it('marks the questions that belong to later features, and nothing else, as answered elsewhere', () => {
    const elsewhere = GENERAL_QUESTIONS.filter((question) => question.handledElsewhere).map(
      (question) => `${question.key}:${question.handledElsewhere}`,
    );
    expect(elsewhere).toEqual([
      'brochure_upload:documents',
      'offerings:offerings',
      'prices_include_gst:offerings',
      'current_offers:offerings',
      'common_questions:faqs',
    ]);
  });

  it('never needs an industry extra to go live', () => {
    for (const questions of Object.values(INDUSTRY_QUESTIONS)) {
      for (const question of questions) expect(question.neededToGoLive, question.key).toBe(false);
    }
  });

  it('starts every extra question key with its industry, so keys can never clash', () => {
    const prefixByIndustry: Record<string, string> = {
      hotel_resort: 'hotel_',
      travel_agent: 'travel_',
      clinic: 'clinic_',
      car_dealer: 'car_',
      education: 'education_',
      wedding_planner: 'wedding_',
      real_estate: 'real_estate_',
    };
    expect(Object.keys(INDUSTRY_QUESTIONS).sort()).toEqual(Object.keys(prefixByIndustry).sort());
    for (const [industry, questions] of Object.entries(INDUSTRY_QUESTIONS)) {
      for (const question of questions) {
        expect(question.key.startsWith(prefixByIndustry[industry]!), question.key).toBe(true);
        expect(question.section).toBe('extra');
      }
    }
  });
});

describe('getQuestionsForIndustry', () => {
  it('gives the general questions plus the extras of a known industry', () => {
    const hotel = getQuestionsForIndustry('hotel_resort');
    expect(hotel.length).toBe(GENERAL_QUESTIONS.length + INDUSTRY_QUESTIONS.hotel_resort!.length);
    expect(hotel.map((question) => question.key)).toContain('hotel_room_types');
  });

  it('gives only the general questions to an industry with no extras', () => {
    for (const industry of ['general', 'other', 'services', 'retail', 'no_such_industry']) {
      expect(getQuestionsForIndustry(industry)).toEqual(GENERAL_QUESTIONS);
    }
  });

  it("finds a question of the business's own set, and not another industry's", () => {
    expect(findQuestionForIndustry('hotel_resort', 'hotel_pets')?.key).toBe('hotel_pets');
    expect(findQuestionForIndustry('clinic', 'hotel_pets')).toBeUndefined();
    expect(findQuestionForIndustry('general', 'business_name')?.key).toBe('business_name');
    expect(findQuestionForIndustry('general', 'nonsense')).toBeUndefined();
  });
});

describe('the situations', () => {
  it('has the seven situations of the requirement, each with a first choice as the default', () => {
    expect(SITUATIONS.map((situation) => situation.key)).toEqual(situationKeySchema.options);
    for (const situation of SITUATIONS) {
      expect(situation.choices.length).toBeGreaterThan(0);
      expect(defaultChoiceKey(situation)).toBe(situation.choices[0]!.key);
    }
  });

  it('fixes exactly the complaint, exact-price and unknown-answer situations, each with one choice', () => {
    const fixed = SITUATIONS.filter((situation) => situation.fixed);
    expect(fixed.map((situation) => situation.key)).toEqual(['complaint', 'exact_price', 'unknown_answer']);
    for (const situation of fixed) expect(situation.choices).toHaveLength(1);
    for (const situation of SITUATIONS.filter((candidate) => !candidate.fixed)) {
      expect(situation.choices.length, situation.key).toBeGreaterThan(1);
    }
  });

  it('gives every choice a different key within its situation, in the shape the database accepts', () => {
    for (const situation of SITUATIONS) {
      const keys = situation.choices.map((choice) => choice.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]{1,79}$/);
    }
  });

  it('finds a situation by key', () => {
    expect(findSituation('after_hours')?.text).toBe('A customer calls after hours');
    expect(findSituation('nonsense')).toBeUndefined();
  });
});

describe('onlyConfirmedAnswers', () => {
  it('lets the AI see confirmed answers and never those waiting for a check', () => {
    const answers = [
      { key: 'a', status: 'confirmed' as const },
      { key: 'b', status: 'check' as const },
      { key: 'c', status: 'confirmed' as const },
    ];
    expect(onlyConfirmedAnswers(answers).map((answer) => answer.key)).toEqual(['a', 'c']);
    expect(onlyConfirmedAnswers([])).toEqual([]);
  });
});
