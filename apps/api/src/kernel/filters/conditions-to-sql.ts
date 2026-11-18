import { sql, type RawBuilder } from 'kysely';
import type { CheckedFilterCondition } from '@toobler-one/shared';

// The SQL for the filter engine (F11): turns conditions that already passed `checkFilterConditions` into one SQL condition a list adds with `.where()`.
// Every value goes in as a parameter, never into the SQL text. Each list names where its custom answers and its built-in fields live.

/** Where a list keeps what a condition can look at. */
export interface FilterColumns {
  /** The jsonb column holding the custom answers, as it is named in the list's query (for example `lead.custom`). */
  customColumn: string;
  /** Built-in fields by the name a condition uses, to the column that holds them (for example `temperature` to `lead.temperature`). */
  builtInColumns: Readonly<Record<string, string>>;
}

/** Puts a backslash before the characters that mean something to LIKE, so they are searched for literally. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/** The SQL for one condition on a built-in column (a plain text column). */
function builtInCondition(column: string, condition: CheckedFilterCondition): RawBuilder<boolean> {
  const columnRef = sql.ref(column);
  const text = String(condition.value);
  switch (condition.operator) {
    case 'is':
      return sql<boolean>`${columnRef} = ${text}`;
    case 'is_not':
      return sql<boolean>`${columnRef} is distinct from ${text}`;
    case 'is_empty':
      return sql<boolean>`${columnRef} is null`;
    case 'is_not_empty':
      return sql<boolean>`${columnRef} is not null`;
    default:
      // The check never lets another operator through for a built-in field; a condition that cannot match anything is safer than a wrong match
      return sql<boolean>`false`;
  }
}

/** The SQL for one condition on a custom answer (a key inside the jsonb column). */
function customCondition(customColumn: string, key: string, condition: CheckedFilterCondition): RawBuilder<boolean> {
  const column = sql.ref(customColumn);
  const asText = sql`(${column} ->> ${key})`;
  // A number answer only counts as a number when it is stored as one, so a damaged value can never break the query
  const asNumber = sql`(case when jsonb_typeof(${column} -> ${key}) = 'number' then (${column} ->> ${key})::numeric end)`;
  const value = condition.value;

  switch (condition.operator) {
    case 'is_empty':
      return sql<boolean>`not jsonb_exists(${column}, ${key})`;
    case 'is_not_empty':
      return sql<boolean>`jsonb_exists(${column}, ${key})`;
    case 'contains':
      return sql<boolean>`${asText} ilike ${`%${escapeLikePattern(String(value))}%`}`;
    default:
      break;
  }
  if (condition.type === 'number') {
    const number = Number(value);
    if (condition.operator === 'is') return sql<boolean>`${asNumber} = ${number}`;
    if (condition.operator === 'is_not') return sql<boolean>`${asNumber} is distinct from ${number}`;
    if (condition.operator === 'greater_than') return sql<boolean>`${asNumber} > ${number}`;
    if (condition.operator === 'less_than') return sql<boolean>`${asNumber} < ${number}`;
  }
  if (condition.type === 'date') {
    // Dates are stored as plain text like 2026-11-20, which sorts the same way as the dates do
    const date = String(value);
    if (condition.operator === 'is') return sql<boolean>`${asText} = ${date}`;
    if (condition.operator === 'before') return sql<boolean>`${asText} < ${date}`;
    if (condition.operator === 'after') return sql<boolean>`${asText} > ${date}`;
  }
  if (condition.type === 'yes_no' && condition.operator === 'is') {
    return sql<boolean>`(${column} -> ${key}) = ${JSON.stringify(value === true)}::jsonb`;
  }
  // Text, email, phone and dropdown: the same word whatever the capitals
  const word = String(value);
  if (condition.operator === 'is') return sql<boolean>`lower(${asText}) = ${word.toLowerCase()}`;
  if (condition.operator === 'is_not') return sql<boolean>`lower(${asText}) is distinct from ${word.toLowerCase()}`;
  return sql<boolean>`false`;
}

/**
 * All the conditions as one SQL condition (every condition must hold). Nothing when there are none. A condition on a field the list does not
 * know cannot happen after the check, and would match nothing.
 */
export function conditionsToSql(
  conditions: readonly CheckedFilterCondition[],
  columns: FilterColumns,
): RawBuilder<boolean> | undefined {
  if (conditions.length === 0) return undefined;
  const parts = conditions.map((condition) => {
    if (condition.field.startsWith('custom.')) {
      return customCondition(columns.customColumn, condition.field.slice('custom.'.length), condition);
    }
    const builtInColumn = columns.builtInColumns[condition.field];
    return builtInColumn === undefined ? sql<boolean>`false` : builtInCondition(builtInColumn, condition);
  });
  return sql<boolean>`(${sql.join(parts, sql` and `)})`;
}
