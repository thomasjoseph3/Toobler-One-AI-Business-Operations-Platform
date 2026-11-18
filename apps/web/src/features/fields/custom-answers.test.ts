import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@toobler-one/shared';
import { answersToTexts, buildCustomRequest, describeAnswer } from './custom-answers';

function field(key: string, type: FieldDefinition['type'], options: string[] = []): FieldDefinition {
  return { id: key, object: 'contact', key, label: key, type, options, aiAsks: false, requiredForWon: false };
}

const definitions = [
  field('birthday', 'date'),
  field('guests', 'number'),
  field('vip', 'yes_no'),
  field('car', 'dropdown', ['Swift']),
];

describe('custom answers in a form', () => {
  it('fills the boxes from what is saved, with Yes/No as yes or no and empty boxes for no answer', () => {
    expect(answersToTexts(definitions, { birthday: '1990-05-04', guests: 12, vip: false })).toEqual({
      birthday: '1990-05-04',
      guests: '12',
      vip: 'no',
      car: '',
    });
  });

  it('sends only the boxes that changed, and null for an emptied box', () => {
    const saved = { birthday: '1990-05-04', guests: 12 };
    const texts = { birthday: '1991-01-01', guests: '', vip: 'yes', car: '' };
    expect(buildCustomRequest(definitions, texts, saved)).toEqual({ birthday: '1991-01-01', guests: null, vip: 'yes' });
  });

  it('sends nothing when nothing changed, and leaves out boxes that are empty and never had an answer', () => {
    const saved = { guests: 12 };
    expect(buildCustomRequest(definitions, answersToTexts(definitions, saved), saved)).toBeUndefined();
    expect(buildCustomRequest(definitions, { birthday: '  ' })).toBeUndefined();
  });

  it('says an answer in words: Yes/No, the saved text, or none', () => {
    expect(describeAnswer(field('vip', 'yes_no'), true)).toBe('Yes');
    expect(describeAnswer(field('vip', 'yes_no'), false)).toBe('No');
    expect(describeAnswer(field('guests', 'number'), 12)).toBe('12');
    expect(describeAnswer(field('guests', 'number'), undefined)).toBe('—');
  });
});
