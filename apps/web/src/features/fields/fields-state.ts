// The pure logic of Settings → Fields: the types and objects with their words, the Add field form's checks, and plain sentences for refusals.
// No screen code here, so it is tested on its own.
import {
  MAX_DROPDOWN_OPTIONS,
  tidyOptions,
  type CreateFieldRequest,
  type FieldObject,
  type FieldType,
} from '@toobler-one/shared';
import { ApiRequestError } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';

/** The three things a field can be added to, in the order the tabs list them. */
export const FIELD_OBJECT_CHOICES: ReadonlyArray<{ object: FieldObject; labelKey: MessageKey }> = [
  { object: 'contact', labelKey: 'fields.object.contact' },
  { object: 'company', labelKey: 'fields.object.company' },
  { object: 'lead', labelKey: 'fields.object.lead' },
];

/** The seven kinds of answer, in the order the Type list shows them, with their words. */
export const FIELD_TYPE_CHOICES: ReadonlyArray<{ type: FieldType; labelKey: MessageKey }> = [
  { type: 'text', labelKey: 'fields.type.text' },
  { type: 'number', labelKey: 'fields.type.number' },
  { type: 'date', labelKey: 'fields.type.date' },
  { type: 'dropdown', labelKey: 'fields.type.dropdown' },
  { type: 'yes_no', labelKey: 'fields.type.yes_no' },
  { type: 'phone', labelKey: 'fields.type.phone' },
  { type: 'email', labelKey: 'fields.type.email' },
];

/** The words for a type ("Dropdown"). */
export function describeFieldType(type: FieldType): string {
  const choice = FIELD_TYPE_CHOICES.find((candidate) => candidate.type === type);
  return choice ? t(choice.labelKey) : type;
}

/** What the person typed in the Add field form. The choices are typed one to a line. */
export interface FieldFormFields {
  label: string;
  type: FieldType;
  optionsText: string;
  aiAsks: boolean;
  requiredForWon: boolean;
}

/** A fresh, empty form (a text field, both switches off). */
export function buildEmptyFieldForm(): FieldFormFields {
  return { label: '', type: 'text', optionsText: '', aiAsks: false, requiredForWon: false };
}

/** The choices typed one to a line, tidied (blanks and repeats dropped). */
export function readOptions(optionsText: string): string[] {
  return tidyOptions(optionsText.split('\n'));
}

/** The problems found in the form, by box (each is the key of a message). */
export interface FieldFormProblems {
  label?: MessageKey;
  options?: MessageKey;
}

/** Checks the form on the device before sending it. An empty object means all is well. The API checks again. */
export function checkFieldForm(fields: FieldFormFields): FieldFormProblems {
  const problems: FieldFormProblems = {};
  if (fields.label.trim() === '') problems.label = 'fields.form.problem.label';
  if (fields.type === 'dropdown') {
    const options = readOptions(fields.optionsText);
    if (options.length === 0) problems.options = 'fields.form.problem.optionsNeeded';
    else if (options.length > MAX_DROPDOWN_OPTIONS) problems.options = 'fields.form.problem.optionsTooMany';
  }
  return problems;
}

/** Turns the form into the request for `POST /fields` for this object ("required before Won" is only sent for leads). */
export function buildCreateFieldRequest(fields: FieldFormFields, object: FieldObject): CreateFieldRequest {
  return {
    object,
    label: fields.label.trim(),
    type: fields.type,
    ...(fields.type === 'dropdown' ? { options: readOptions(fields.optionsText) } : {}),
    aiAsks: fields.aiAsks,
    requiredForWon: object === 'lead' ? fields.requiredForWon : false,
  };
}

/** One plain sentence for a failed change to the fields. The API's own words are shown for a refusal it wrote in plain words (the limit of 50). */
export function describeFieldProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('fields.problem.network');
    if (error.status === 403) return t('settings.managersOnly');
    if ((error.status === 400 || error.status === 409) && error.message && error.code !== 'UNKNOWN_ERROR')
      return error.message;
  }
  return t('fields.problem.generic');
}
