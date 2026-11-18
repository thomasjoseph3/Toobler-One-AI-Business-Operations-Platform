// The import wizard on the screen (F12): the choices for each column and the sentences that say what an import will do or did. Pure functions (no screen, no network).
import type { FieldDefinition, ImportCounts } from '@toobler-one/shared';
import { formatMessage, t, type MessageKey } from '../../app/i18n';

/** The file kinds the file box offers (the API checks the real content as well). */
export const IMPORT_FILE_ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** How long to wait between asks while an import runs, in milliseconds. */
export const IMPORT_POLL_MILLISECONDS = 1500;

const STANDARD_TARGET_KEYS: ReadonlyArray<{ value: string; labelKey: MessageKey }> = [
  { value: 'name', labelKey: 'import.target.name' },
  { value: 'phone', labelKey: 'import.target.phone' },
  { value: 'email', labelKey: 'import.target.email' },
  { value: 'company', labelKey: 'import.target.company' },
  { value: 'language', labelKey: 'import.target.language' },
];

/** What a column can be: not imported, the standard contact details, then the business's own contact fields. The empty value means "not imported". */
export function listTargetChoices(contactFields: readonly FieldDefinition[]): Array<{ value: string; label: string }> {
  return [
    { value: '', label: t('import.target.skip') },
    ...STANDARD_TARGET_KEYS.map((choice) => ({ value: choice.value, label: t(choice.labelKey) })),
    ...contactFields.map((field) => ({ value: `custom.${field.key}`, label: field.label })),
  ];
}

/** True when two choices of columns are the same. */
export function sameTargets(first: ReadonlyArray<string | null>, second: ReadonlyArray<string | null>): boolean {
  return first.length === second.length && first.every((target, index) => target === second[index]);
}

/** "1,240 new contacts, 86 match contacts you already have (they will be updated), 12 rows skipped" in words that fit the numbers. */
export function describeImportCounts(counts: ImportCounts, isDone: boolean): string {
  return formatMessage(isDone ? 'import.counts.done' : 'import.counts.preview', {
    newContacts: counts.newContacts.toLocaleString('en'),
    matchedContacts: counts.matchedContacts.toLocaleString('en'),
    skipped: counts.skipped.toLocaleString('en'),
  });
}

/** "Row 14: The phone number is not a valid number." */
export function describeReportRow(row: number, message: string): string {
  return formatMessage('import.report.row', { row, message });
}

/** The share of rows done, 0 to 100 (a whole number), for the progress bar. */
export function findProgressPercent(processed: number, rowCount: number): number {
  if (rowCount <= 0) return 100;
  return Math.min(100, Math.floor((processed / rowCount) * 100));
}
