// The Filter panel's extra conditions (F11): which fields can be picked, which operators fit each, and when a half-filled row is ready to apply.
// Pure functions (no screen, no network), so each rule can be tested alone.
import {
  customFieldsToFilterable,
  findOperatorsFor,
  operatorNeedsValue,
  type FieldDefinition,
  type FilterableField,
  type FilterCondition,
  type FilterOperator,
} from '@toobler-one/shared';
import { t, type MessageKey } from '../../app/i18n';

/** The temperature, which every business can filter on. */
const TEMPERATURE_FIELD: FilterableField = {
  field: 'temperature',
  label: '',
  type: 'dropdown',
  options: ['hot', 'warm', 'cold', 'unscored'],
};

/** What a lead can be filtered on: the temperature, then the business's own lead fields in their order. The temperature's name is written in the person's words. */
export function listFilterableLeadFields(definitions: readonly FieldDefinition[]): FilterableField[] {
  return [{ ...TEMPERATURE_FIELD, label: t('leads.filter.temperature') }, ...customFieldsToFilterable(definitions)];
}

const OPERATOR_LABEL_KEYS: Record<FilterOperator, MessageKey> = {
  is: 'filterOperator.is',
  is_not: 'filterOperator.is_not',
  contains: 'filterOperator.contains',
  greater_than: 'filterOperator.greater_than',
  less_than: 'filterOperator.less_than',
  before: 'filterOperator.before',
  after: 'filterOperator.after',
  is_empty: 'filterOperator.is_empty',
  is_not_empty: 'filterOperator.is_not_empty',
};

/** The words for an operator ("is more than", "is empty"). */
export function describeOperator(operator: FilterOperator): string {
  return t(OPERATOR_LABEL_KEYS[operator]);
}

/** The operators to offer for a field. */
export function listOperatorsFor(field: FilterableField): readonly FilterOperator[] {
  return findOperatorsFor(field.type);
}

/** A new row for a field: its first operator and no value yet. */
export function startCondition(field: FilterableField): FilterCondition {
  const firstOperator = listOperatorsFor(field)[0];
  return { field: field.field, operator: firstOperator ?? 'is' };
}

/** What happens to a row when its field changes: it starts again with that field's first operator (the old operator and value may not fit). */
export function changeConditionField(field: FilterableField): FilterCondition {
  return startCondition(field);
}

/** What happens to a row when its operator changes: the value is kept only when the new operator still takes one. */
export function changeConditionOperator(condition: FilterCondition, operator: FilterOperator): FilterCondition {
  if (!operatorNeedsValue(operator)) return { field: condition.field, operator };
  return condition.value === undefined ? { field: condition.field, operator } : { ...condition, operator };
}

/** True when the row can be applied: its operator takes no value, or it has one that is not blank. */
export function isConditionComplete(condition: FilterCondition): boolean {
  if (!operatorNeedsValue(condition.operator)) return true;
  return condition.value !== undefined && String(condition.value).trim() !== '';
}

/** The rows that are ready to apply (half-filled rows wait). */
export function pickCompleteConditions(rows: readonly FilterCondition[]): FilterCondition[] {
  return rows.filter(isConditionComplete);
}

/** The word a dropdown choice or a yes/no is shown with (the temperature's words are the screen's own). */
export function describeChoice(field: FilterableField, choice: string): string {
  if (field.field === 'temperature') {
    const keys: Record<string, MessageKey> = {
      hot: 'temperature.hot',
      warm: 'temperature.warm',
      cold: 'temperature.cold',
      unscored: 'temperature.unscored',
    };
    const key = keys[choice];
    return key ? t(key) : choice;
  }
  return choice;
}
