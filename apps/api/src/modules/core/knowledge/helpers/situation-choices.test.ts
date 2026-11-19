import { describe, expect, it } from 'vitest';
import { resolveAllSituations, resolveSituation } from './situation-choices';
import { findSituation, SITUATIONS } from './situations';

const discount = findSituation('discount_request')!;
const savedAt = new Date('2026-11-12T10:00:00Z');

describe('resolveSituation', () => {
  it('gives the ready-picked default to a business that has not chosen', () => {
    expect(resolveSituation(discount, undefined)).toMatchObject({
      key: 'discount_request',
      selectedChoiceKey: 'staff_call_with_best_price',
      isDefault: true,
      updatedAt: null,
      fixed: false,
    });
  });

  it('gives the saved choice, with when it was saved', () => {
    const situation = resolveSituation(discount, {
      situationKey: 'discount_request',
      choice: 'prices_are_fixed',
      updatedAt: savedAt,
    });
    expect(situation).toMatchObject({ selectedChoiceKey: 'prices_are_fixed', isDefault: false });
    expect(situation.updatedAt).toBe(savedAt.toISOString());
  });

  it('falls back to the default when the saved choice no longer exists', () => {
    const situation = resolveSituation(discount, {
      situationKey: 'discount_request',
      choice: 'a_choice_that_was_removed',
      updatedAt: savedAt,
    });
    expect(situation).toMatchObject({
      selectedChoiceKey: 'staff_call_with_best_price',
      isDefault: true,
      updatedAt: null,
    });
  });

  it('lists the choices with their words, the default first', () => {
    const situation = resolveSituation(discount, undefined);
    expect(situation.choices.map((choice) => choice.key)).toEqual([
      'staff_call_with_best_price',
      'prices_are_fixed',
      'tell_current_offer',
    ]);
    expect(situation.choices[1]!.label).toBe('Prices are fixed');
  });
});

describe('resolveAllSituations', () => {
  it('gives all seven in the fixed order, and uses only the choices saved for each', () => {
    const all = resolveAllSituations([
      { situationKey: 'after_hours', choice: 'call_at_opening_only', updatedAt: savedAt },
      { situationKey: 'no_such_situation', choice: 'x', updatedAt: savedAt },
    ]);
    expect(all.map((situation) => situation.key)).toEqual(SITUATIONS.map((situation) => situation.key));
    expect(all.find((situation) => situation.key === 'after_hours')).toMatchObject({
      selectedChoiceKey: 'call_at_opening_only',
      isDefault: false,
    });
    expect(all.filter((situation) => !situation.isDefault)).toHaveLength(1);
  });
});
