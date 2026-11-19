import { describe, expect, it } from 'vitest';
import {
  checkFilterConditions,
  customFieldsToFilterable,
  findOperatorsFor,
  MAX_FILTER_CONDITIONS,
  parseFiltersText,
  type FilterableField,
} from './filter-conditions';
import type { FieldDefinition } from './custom-fields';

const definition = (changes: Partial<FieldDefinition>): FieldDefinition => ({
  id: '1',
  object: 'lead',
  key: 'x',
  label: 'X',
  type: 'text',
  options: [],
  aiAsks: false,
  requiredForWon: false,
  ...changes,
});
const filterable: FilterableField[] = [
  { field: 'temperature', label: 'Temperature', type: 'dropdown', options: ['hot', 'warm', 'cold', 'unscored'] },
  ...customFieldsToFilterable([
    definition({ key: 'guests', label: 'Guest count', type: 'number' }),
    definition({ key: 'wedding', label: 'Wedding date', type: 'date' }),
    definition({ key: 'car', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] }),
    definition({ key: 'vip', label: 'VIP', type: 'yes_no' }),
    definition({ key: 'note', label: 'Note', type: 'text' }),
  ]),
];

describe('checkFilterConditions', () => {
  it('accepts a condition for each kind of field and tidies its value', () => {
    const { checked, problems } = checkFilterConditions(
      [
        { field: 'temperature', operator: 'is', value: 'HOT' },
        { field: 'custom.guests', operator: 'greater_than', value: '1,200' },
        { field: 'custom.wedding', operator: 'before', value: '2026-12-31' },
        { field: 'custom.car', operator: 'is_not', value: 'swift' },
        { field: 'custom.vip', operator: 'is', value: 'Yes' },
        { field: 'custom.note', operator: 'contains', value: '  garden ' },
        { field: 'custom.note', operator: 'is_empty' },
      ],
      filterable,
    );
    expect(problems).toEqual([]);
    expect(checked.map((condition) => condition.value)).toEqual([
      'hot',
      1200,
      '2026-12-31',
      'Swift',
      true,
      'garden',
      undefined,
    ]);
  });

  it('refuses an unknown field, an operator that does not fit the kind, and a value that does not fit', () => {
    const { checked, problems } = checkFilterConditions(
      [
        { field: 'custom.nope', operator: 'is', value: 'a' },
        { field: 'custom.guests', operator: 'contains', value: '5' },
        { field: 'custom.guests', operator: 'greater_than', value: 'many' },
        { field: 'custom.wedding', operator: 'after', value: '2026-02-31' },
        { field: 'custom.car', operator: 'is', value: 'Tesla' },
        { field: 'custom.vip', operator: 'is', value: 'maybe' },
        { field: 'custom.guests', operator: 'is' },
      ],
      filterable,
    );
    expect(checked).toEqual([]);
    expect(problems.map((problem) => problem.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(problems[1]!.message).toContain('Guest count');
  });

  it('refuses more than 10 conditions', () => {
    const many = Array.from({ length: MAX_FILTER_CONDITIONS + 1 }, () => ({
      field: 'temperature',
      operator: 'is' as const,
      value: 'hot',
    }));
    expect(checkFilterConditions(many, filterable).problems).toHaveLength(1);
  });

  it('has the operators for each kind', () => {
    expect(findOperatorsFor('number')).toContain('greater_than');
    expect(findOperatorsFor('date')).toContain('before');
    expect(findOperatorsFor('yes_no')).not.toContain('contains');
  });
});

describe('parseFiltersText', () => {
  it('reads a list of conditions', () => {
    expect(parseFiltersText('[{"field":"temperature","operator":"is","value":"hot"}]')).toEqual({
      conditions: [{ field: 'temperature', operator: 'is', value: 'hot' }],
    });
    expect(parseFiltersText('[]')).toEqual({ conditions: [] });
  });
  it('says what is wrong with text that is not a list of conditions', () => {
    expect('problem' in parseFiltersText('not json')).toBe(true);
    expect('problem' in parseFiltersText('{"field":"a"}')).toBe(true);
    expect('problem' in parseFiltersText('[{"field":"a","operator":"is","colour":"red"}]')).toBe(true);
    expect('problem' in parseFiltersText('x'.repeat(4001))).toBe(true);
  });
});
