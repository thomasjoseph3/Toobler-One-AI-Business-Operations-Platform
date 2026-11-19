import type { CustomValue } from '@toobler-one/shared';

// How values are written into the cells of an export (F12). Pure: no database.

/** The most rows one export holds. */
export const MAX_EXPORT_ROWS = 50_000;

/** A custom answer as a cell: yes/no in words, a number or text as it is, nothing when there is no answer. */
export function customAnswerToCell(answer: CustomValue | undefined): string {
  if (answer === undefined) return '';
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  return String(answer);
}

/** A UTC moment as its date, "2026-11-20" (a spreadsheet sorts and filters these), or nothing. */
export function momentToDateCell(moment: Date | string | null): string {
  if (moment === null) return '';
  return (typeof moment === 'string' ? new Date(moment) : moment).toISOString().slice(0, 10);
}
