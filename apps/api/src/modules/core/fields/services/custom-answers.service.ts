import {
  validateCustomValues,
  type CustomValue,
  type CustomValuesInput,
  type FieldDefinition,
  type FieldObject,
} from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { listFieldDefinitions } from '../repositories/field-definitions.repository';

// What contacts, companies and leads all do with the answers to their custom fields: check what was sent, merge it into what is stored, hide the
// answers of removed fields. One copy here, so the three objects can never disagree. Other modules reach it through this module's index.

/** The live (not removed) custom fields of one object, in order. Other modules call this inside their own transaction. */
export function findFieldDefinitions(db: Db, accountId: string, object: FieldObject): Promise<FieldDefinition[]> {
  return listFieldDefinitions(db, accountId, object);
}

/**
 * Checks the answers sent with a record against the object's live fields (the one shared check). Throws 400 INVALID_CUSTOM_VALUES with the first
 * problem in plain words. Returns the tidy answers: an empty answer is `null`, meaning "remove this key".
 */
export async function checkCustomAnswers(
  db: Db,
  accountId: string,
  object: FieldObject,
  answers: CustomValuesInput,
): Promise<Record<string, CustomValue | null>> {
  if (Object.keys(answers).length === 0) return {};
  const definitions = await findFieldDefinitions(db, accountId, object);
  const { values, problems } = validateCustomValues(definitions, answers);
  const firstProblem = problems[0];
  if (firstProblem) throw new ApiError(400, 'INVALID_CUSTOM_VALUES', firstProblem.message, { problems });
  return values;
}

/** The stored answers with the sent ones applied: a `null` removes its key, anything else sets it. A key that was not sent stays as it is. Pure. */
export function mergeCustomAnswers(
  stored: Readonly<Record<string, unknown>>,
  sent: Readonly<Record<string, CustomValue | null>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(sent)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Whether two sets of answers hold exactly the same things. Pure. */
export function sameCustomAnswers(
  first: Readonly<Record<string, unknown>>,
  second: Readonly<Record<string, unknown>>,
): boolean {
  const firstKeys = Object.keys(first);
  return firstKeys.length === Object.keys(second).length && firstKeys.every((key) => first[key] === second[key]);
}

/** The records with only the answers of live fields: answers kept for a removed field stay in the database but are never shown. */
export async function hideRemovedFieldAnswers<Record extends { custom: Readonly<{ [key: string]: CustomValue }> }>(
  db: Db,
  accountId: string,
  object: FieldObject,
  records: Record[],
): Promise<Record[]> {
  if (records.every((record) => Object.keys(record.custom).length === 0)) return records;
  const liveKeys = new Set((await findFieldDefinitions(db, accountId, object)).map((definition) => definition.key));
  return records.map((record) => ({
    ...record,
    custom: Object.fromEntries(Object.entries(record.custom).filter(([key]) => liveKeys.has(key))),
  }));
}

/**
 * The names of the lead fields marked "Required before Won" that have no answer yet. Empty when the lead may be marked Won. Answers of removed
 * fields do not count, and neither do removed fields' requirements.
 */
export async function findMissingRequiredLeadFields(
  db: Db,
  accountId: string,
  answers: Readonly<Record<string, unknown>>,
): Promise<string[]> {
  const definitions = await findFieldDefinitions(db, accountId, 'lead');
  return definitions
    .filter((definition) => definition.requiredForWon && answers[definition.key] === undefined)
    .map((definition) => definition.label);
}
