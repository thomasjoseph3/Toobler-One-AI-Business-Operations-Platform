import type {
  DuplicateObject,
  DuplicateReason,
  DuplicateRecord,
  DuplicateSuggestion,
  FieldDefinition,
  MergeDuplicateRequest,
  PairSide,
} from '@toobler-one/shared';
import { ApiRequestError } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';

// The thinking behind the "Possible duplicates" screen, kept apart from the screen so it can be tested without drawing anything.

/** The words for each reason a pair looks like one record. */
export const REASON_MESSAGE_KEYS: Record<DuplicateReason, MessageKey> = {
  same_name_similar_phone: 'duplicates.reason.same_name_similar_phone',
  same_name_same_email_name: 'duplicates.reason.same_name_same_email_name',
  same_email_name_similar_phone: 'duplicates.reason.same_email_name_similar_phone',
  same_name_without_suffix: 'duplicates.reason.same_name_without_suffix',
  same_phone: 'duplicates.reason.same_phone',
};

/** One line of the side-by-side comparison: what the field is called, what each record has, and where the choice goes in the merge request. */
export interface ComparedField {
  /** A stable id for the line (also the radio group's name suffix). */
  id: string;
  label: string;
  firstValue: string;
  secondValue: string;
  /** True when the two values differ, so staff must pick one. */
  differs: boolean;
  /** The choice this line makes in the merge request: a field of `take`, or a custom field's key. */
  choice: { kind: 'field'; field: string } | { kind: 'custom'; key: string };
}

/** The fields shown for each kind of record, in order: the label key, the record's value, and the `take` field the choice goes to. */
function listBuiltInLines(
  object: DuplicateObject,
  record: DuplicateRecord,
): Array<{ field: string; labelKey: MessageKey; value: string | null }> {
  if (object === 'contact') {
    return [
      { field: 'name', labelKey: 'duplicates.field.name', value: record.name },
      { field: 'phone', labelKey: 'duplicates.field.phone', value: record.phone },
      { field: 'email', labelKey: 'duplicates.field.email', value: record.email },
      { field: 'language', labelKey: 'duplicates.field.language', value: record.language },
      {
        field: 'lifecycleStage',
        labelKey: 'duplicates.field.stage',
        value: record.lifecycleStage === null ? null : t(`contacts.stage.${record.lifecycleStage}`),
      },
      { field: 'company', labelKey: 'duplicates.field.company', value: record.companyName },
    ];
  }
  return [
    { field: 'name', labelKey: 'duplicates.field.name', value: record.name },
    { field: 'phone', labelKey: 'duplicates.field.phone', value: record.phone },
    { field: 'domain', labelKey: 'duplicates.field.domain', value: record.domain },
    { field: 'city', labelKey: 'duplicates.field.city', value: record.city },
    { field: 'owner', labelKey: 'duplicates.field.owner', value: record.ownerName },
  ];
}

/** Shows an empty value as a dash, a yes/no answer as words, and anything else as it is. */
function showValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('duplicates.yes') : t('duplicates.no');
  return String(value);
}

/** The lines of the side-by-side comparison: the built-in fields, then the business's own custom fields. */
export function listComparedFields(suggestion: DuplicateSuggestion, customFields: FieldDefinition[]): ComparedField[] {
  const firstLines = listBuiltInLines(suggestion.object, suggestion.a);
  const secondLines = listBuiltInLines(suggestion.object, suggestion.b);
  const lines: ComparedField[] = firstLines.map((firstLine, index) => {
    const firstValue = showValue(firstLine.value);
    const secondValue = showValue(secondLines[index]?.value);
    return {
      id: firstLine.field,
      label: t(firstLine.labelKey),
      firstValue,
      secondValue,
      differs: firstValue !== secondValue,
      choice: { kind: 'field', field: firstLine.field },
    };
  });
  for (const field of customFields) {
    const firstValue = showValue(suggestion.a.custom[field.key]);
    const secondValue = showValue(suggestion.b.custom[field.key]);
    if (firstValue === '—' && secondValue === '—') continue;
    lines.push({
      id: `custom-${field.key}`,
      label: field.label,
      firstValue,
      secondValue,
      differs: firstValue !== secondValue,
      choice: { kind: 'custom', key: field.key },
    });
  }
  return lines;
}

/**
 * Turns what staff picked into the merge request. `choices` holds the side picked for each line that differs (by the line's id); a line left out
 * keeps the kept record's value. Only lines where the two values differ are sent.
 */
export function buildMergeRequest(
  keep: PairSide,
  lines: ComparedField[],
  choices: Record<string, PairSide>,
): MergeDuplicateRequest {
  const take: Record<string, PairSide> = {};
  const custom: Record<string, PairSide> = {};
  for (const line of lines) {
    const side = choices[line.id];
    if (!line.differs || side === undefined) continue;
    if (line.choice.kind === 'field') take[line.choice.field] = side;
    else custom[line.choice.key] = side;
  }
  return { keep, take: { ...take, ...(Object.keys(custom).length > 0 ? { custom } : {}) } };
}

/** The name to call a record in sentences ("Anil Kumar"), or a plain word when it has none. */
export function describeRecord(record: DuplicateRecord): string {
  return record.name ?? record.phone ?? record.email ?? t('duplicates.unnamed');
}

/** One plain sentence for a refused or failed step. Never a code or a status number. */
export function describeDuplicatesProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 404) return t('duplicates.error.gone');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('duplicates.error.unknown');
}
