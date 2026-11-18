import { z } from 'zod';
import type { FieldDefinition, FieldType } from './custom-fields';

// The filter engine (F11): the conditions staff put on a list ("Car model is Swift", "Guest count is more than 100", "Temperature is hot"). One shape for
// every list, one check for every condition, so the lists, the saved views and the AI's tools can never disagree. The SQL for a condition is written by each
// list's own module; this file only says what a condition is and whether it makes sense for its field.

/** What a condition does with the value. */
export const filterOperatorSchema = z.enum([
  'is',
  'is_not',
  'contains',
  'greater_than',
  'less_than',
  'before',
  'after',
  'is_empty',
  'is_not_empty',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

/** One condition: a field, what to do, and (for most operators) the value. A custom field is written `custom.<key>`; a built-in one by its own name. */
export const filterConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    operator: filterOperatorSchema,
    value: z.union([z.string().trim().max(500), z.number(), z.boolean()]).optional(),
  })
  .strict();
export type FilterCondition = z.infer<typeof filterConditionSchema>;

/** The most conditions one list can have at once. */
export const MAX_FILTER_CONDITIONS = 10;

/** The conditions as they travel in the address (`filters=[...]`): a JSON list of at most 10, at most 4000 characters. */
export const MAX_FILTERS_TEXT_LENGTH = 4000;

/** What one list lets staff filter on, besides the business's own custom fields: a built-in field, its kind of answer and the choices of a dropdown. */
export interface FilterableField {
  /** How a condition names the field: `temperature`, or `custom.car_model`. */
  field: string;
  /** What the person sees. */
  label: string;
  type: FieldType;
  /** The choices of a dropdown (its words), else empty. */
  options: readonly string[];
}

/** The operators that make sense for each kind of field. */
const OPERATORS_BY_TYPE: Record<FieldType, readonly FilterOperator[]> = {
  text: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  email: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  phone: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  number: ['is', 'is_not', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
  date: ['is', 'before', 'after', 'is_empty', 'is_not_empty'],
  dropdown: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  yes_no: ['is', 'is_empty', 'is_not_empty'],
};

/** The operators a person can choose for a field of this kind. */
export function findOperatorsFor(type: FieldType): readonly FilterOperator[] {
  return OPERATORS_BY_TYPE[type];
}

/** The business's custom fields as filterable fields (`custom.<key>`). */
export function customFieldsToFilterable(definitions: readonly FieldDefinition[]): FilterableField[] {
  return definitions.map((definition) => ({
    field: `custom.${definition.key}`,
    label: definition.label,
    type: definition.type,
    options: definition.options,
  }));
}

/** Why a condition was refused, in words for the person. */
export interface FilterProblem {
  index: number;
  message: string;
}

/** A condition that passed the check, with its value in the shape the database needs. */
export interface CheckedFilterCondition {
  field: string;
  type: FieldType;
  operator: FilterOperator;
  /** Text, a number or yes/no (true or false); absent for "is empty" and "is not empty". */
  value?: string | number | boolean;
}

/** True when this operator needs a value (everything except "is empty" and "is not empty"). */
export function operatorNeedsValue(operator: FilterOperator): boolean {
  return operator !== 'is_empty' && operator !== 'is_not_empty';
}

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** True for a real calendar date written as 2026-11-20 (a made-up day such as 2026-02-31 is refused). */
function isRealPlainDate(text: string): boolean {
  if (!PLAIN_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** Reads a value for a field of this kind in the shape the database compares: a number for numbers, true or false for yes/no, text otherwise. Undefined when it makes no sense. */
function readValue(
  type: FieldType,
  options: readonly string[],
  raw: string | number | boolean,
): string | number | boolean | undefined {
  if (type === 'number') {
    const number =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(/,/gu, '')) : Number.NaN;
    return Number.isFinite(number) ? number : undefined;
  }
  if (type === 'yes_no') {
    if (typeof raw === 'boolean') return raw;
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (['yes', 'true'].includes(word)) return true;
    if (['no', 'false'].includes(word)) return false;
    return undefined;
  }
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const text = raw.trim();
  if (type === 'date') return isRealPlainDate(text) ? text : undefined;
  if (type === 'dropdown') return options.find((option) => option.toLowerCase() === text.toLowerCase());
  return text;
}

/**
 * Checks the conditions against what the list can filter on: the field must exist, the operator must make sense for its kind, and the value must fit
 * (a number for a number, a real date, one of the dropdown's choices, yes or no). Returns the tidy conditions and the problems; a list refuses the request
 * when there is any problem. At most 10 conditions. Pure: no database.
 */
export function checkFilterConditions(
  conditions: readonly FilterCondition[],
  filterable: readonly FilterableField[],
): { checked: CheckedFilterCondition[]; problems: FilterProblem[] } {
  const checked: CheckedFilterCondition[] = [];
  const problems: FilterProblem[] = [];
  if (conditions.length > MAX_FILTER_CONDITIONS) {
    problems.push({ index: MAX_FILTER_CONDITIONS, message: `Use at most ${MAX_FILTER_CONDITIONS} filters at once.` });
    return { checked, problems };
  }
  for (const [index, condition] of conditions.entries()) {
    const target = filterable.find((candidate) => candidate.field === condition.field);
    if (!target) {
      problems.push({ index, message: 'That field cannot be filtered.' });
      continue;
    }
    if (!OPERATORS_BY_TYPE[target.type].includes(condition.operator)) {
      problems.push({ index, message: `${target.label} cannot be filtered that way.` });
      continue;
    }
    if (!operatorNeedsValue(condition.operator)) {
      checked.push({ field: target.field, type: target.type, operator: condition.operator });
      continue;
    }
    const value = condition.value === undefined ? undefined : readValue(target.type, target.options, condition.value);
    if (value === undefined) {
      problems.push({ index, message: `${target.label} needs a value that fits (a ${describeKind(target.type)}).` });
      continue;
    }
    checked.push({ field: target.field, type: target.type, operator: condition.operator, value });
  }
  return { checked, problems };
}

/** The kind of value a field takes, in words. */
function describeKind(type: FieldType): string {
  switch (type) {
    case 'number':
      return 'number';
    case 'date':
      return 'date like 2026-11-20';
    case 'dropdown':
      return 'choice from its list';
    case 'yes_no':
      return 'yes or no';
    default:
      return 'word or phrase';
  }
}

/**
 * Reads the `filters` text of an address: a JSON list of conditions. Returns the conditions, or the problem in words (not JSON, not a list, a condition
 * of the wrong shape, too long). Pure.
 */
export function parseFiltersText(text: string): { conditions: FilterCondition[] } | { problem: string } {
  if (text.length > MAX_FILTERS_TEXT_LENGTH) return { problem: 'The filters are too long.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problem: 'The filters could not be read.' };
  }
  const result = z.array(filterConditionSchema).safeParse(parsed);
  return result.success ? { conditions: result.data } : { problem: 'The filters are not in the right shape.' };
}
