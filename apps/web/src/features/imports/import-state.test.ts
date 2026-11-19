import type { FieldDefinition } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import {
  describeImportCounts,
  describeReportRow,
  findProgressPercent,
  listTargetChoices,
  sameTargets,
} from './import-state';

const car: FieldDefinition = {
  id: '1',
  object: 'contact',
  key: 'car_model',
  label: 'Car model',
  type: 'text',
  options: [],
  aiAsks: false,
  requiredForWon: false,
};

describe('listTargetChoices', () => {
  it('offers not imported first, then the contact details, then the business’s own fields', () => {
    const choices = listTargetChoices([car]);
    expect(choices[0]).toEqual({ value: '', label: 'Do not import' });
    expect(choices.map((choice) => choice.value)).toEqual([
      '',
      'name',
      'phone',
      'email',
      'company',
      'language',
      'custom.car_model',
    ]);
    expect(choices.at(-1)!.label).toBe('Car model');
  });
});

describe('describeImportCounts', () => {
  it('says what will happen before the run and what happened after it', () => {
    const counts = { newContacts: 1240, matchedContacts: 86, skipped: 12 };
    expect(describeImportCounts(counts, false)).toBe(
      '1,240 new contacts, 86 match contacts you already have (they will be updated, not added twice), 12 rows will be skipped.',
    );
    expect(describeImportCounts(counts, true)).toBe(
      '1,240 new contacts were added, 86 matched contacts you already have (they were updated, not added twice), 12 rows were skipped.',
    );
  });
});

describe('the small helpers', () => {
  it('compares choices of columns', () => {
    expect(sameTargets(['phone', null], ['phone', null])).toBe(true);
    expect(sameTargets(['phone', null], ['phone', 'name'])).toBe(false);
    expect(sameTargets(['phone'], ['phone', null])).toBe(false);
  });
  it('writes a report row and a percentage', () => {
    expect(describeReportRow(14, 'The phone number is not a valid number.')).toBe(
      'Row 14: The phone number is not a valid number.',
    );
    expect(findProgressPercent(250, 1000)).toBe(25);
    expect(findProgressPercent(1000, 1000)).toBe(100);
    expect(findProgressPercent(0, 0)).toBe(100);
    expect(findProgressPercent(5000, 1000)).toBe(100);
  });
});
