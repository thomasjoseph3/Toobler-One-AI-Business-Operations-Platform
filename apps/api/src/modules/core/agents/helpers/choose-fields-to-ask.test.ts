import type { FieldDefinition } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { chooseFieldsToAsk } from './choose-fields-to-ask';

function field(object: FieldDefinition['object'], key: string, aiAsks: boolean): FieldDefinition {
  return { id: key, object, key, label: key, type: 'text', options: [], aiAsks, requiredForWon: false };
}

describe('chooseFieldsToAsk', () => {
  it('keeps only the fields marked "AI should ask", contact fields first, in the business’s order', () => {
    const chosen = chooseFieldsToAsk([
      field('lead', 'a', true),
      field('contact', 'b', false),
      field('contact', 'c', true),
    ]);
    expect(chosen.map((entry) => entry.key)).toEqual(['c', 'a']);
  });

  it('never asks more than three, and never about companies', () => {
    const chosen = chooseFieldsToAsk([
      field('company', 'firm', true),
      field('contact', 'one', true),
      field('contact', 'two', true),
      field('lead', 'three', true),
      field('lead', 'four', true),
    ]);
    expect(chosen.map((entry) => entry.key)).toEqual(['one', 'two', 'three']);
  });

  it('asks nothing when no field is marked', () => {
    expect(chooseFieldsToAsk([field('contact', 'x', false)])).toEqual([]);
  });
});
