import type { FieldDefinition } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import {
  changeConditionOperator,
  isConditionComplete,
  listFilterableLeadFields,
  listOperatorsFor,
  pickCompleteConditions,
  startCondition,
} from './filter-conditions-ui';

const guests: FieldDefinition = {
  id: '1',
  object: 'lead',
  key: 'guests',
  label: 'Guests',
  type: 'number',
  options: [],
  aiAsks: false,
  requiredForWon: false,
};

describe('the fields a lead can be filtered on', () => {
  it('lists the temperature first, then the custom fields as custom.<key>', () => {
    const fields = listFilterableLeadFields([guests]);
    expect(fields.map((field) => field.field)).toEqual(['temperature', 'custom.guests']);
    expect(fields[0]!.label).toBe('Temperature');
    expect(fields[1]!.label).toBe('Guests');
  });
});

describe('a row of the conditions editor', () => {
  it('starts with the first operator of its field and no value', () => {
    const [, guestsField] = listFilterableLeadFields([guests]);
    expect(startCondition(guestsField!)).toEqual({ field: 'custom.guests', operator: 'is' });
    expect(listOperatorsFor(guestsField!)).toContain('greater_than');
  });

  it('keeps the value when the operator still takes one, and drops it for "is empty"', () => {
    const row = { field: 'custom.guests', operator: 'is' as const, value: '100' };
    expect(changeConditionOperator(row, 'greater_than')).toEqual({ ...row, operator: 'greater_than' });
    expect(changeConditionOperator(row, 'is_empty')).toEqual({ field: 'custom.guests', operator: 'is_empty' });
  });

  it('waits to be applied until it has a value, except for "is empty" and "is not empty"', () => {
    expect(isConditionComplete({ field: 'a', operator: 'is' })).toBe(false);
    expect(isConditionComplete({ field: 'a', operator: 'is', value: '  ' })).toBe(false);
    expect(isConditionComplete({ field: 'a', operator: 'is', value: 0 })).toBe(true);
    expect(isConditionComplete({ field: 'a', operator: 'is_empty' })).toBe(true);
    expect(
      pickCompleteConditions([
        { field: 'a', operator: 'is' },
        { field: 'b', operator: 'is_not_empty' },
      ]),
    ).toEqual([{ field: 'b', operator: 'is_not_empty' }]);
  });
});
