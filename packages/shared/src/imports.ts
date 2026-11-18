import { z } from 'zod';
import type { FieldDefinition } from './custom-fields';

// Spreadsheet imports between the API and the web app (F12): upload a file, check which column is which, run, read the report. Managers only.
// The pure parts (guessing the columns, checking the mapping, reading a row) are here so the API and the screen can never disagree.

/** The biggest file accepted, in bytes (10 MB). */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
/** The most data rows one import can have. */
export const MAX_IMPORT_ROWS = 50_000;
/** The most columns one file can have. */
export const MAX_IMPORT_COLUMNS = 60;
/** The longest cell kept (longer text is cut when the file is read, and a longer custom answer is refused by its own field's rule). */
export const MAX_IMPORT_CELL_LENGTH = 1000;
/** How many skipped rows the report lists (the count of skipped rows is always exact). */
export const MAX_REPORT_ROWS = 200;
/** How many rows of the file the preview shows. */
export const IMPORT_PREVIEW_ROWS = 5;

/** What an import does with one column of the file: a contact detail, or a custom contact field written `custom.<key>`. A column left out is `null`. */
export const STANDARD_IMPORT_TARGETS = ['name', 'phone', 'email', 'company', 'language'] as const;
export type StandardImportTarget = (typeof STANDARD_IMPORT_TARGETS)[number];

export const importStatusSchema = z.enum(['uploaded', 'ready', 'running', 'done', 'failed']);
export type ImportStatus = z.infer<typeof importStatusSchema>;

/** Why a row was skipped. */
export const importSkipReasonSchema = z.enum([
  'no_contact_point',
  'invalid_phone',
  'invalid_email',
  'invalid_language',
  'invalid_custom',
]);
export type ImportSkipReason = z.infer<typeof importSkipReasonSchema>;

/** One skipped row of the report: its number in the file (the header is row 1), why, and a sentence for the person. Never the row's own words. */
export const importReportRowSchema = z.object({
  row: z.number().int(),
  reason: importSkipReasonSchema,
  message: z.string(),
});
export type ImportReportRow = z.infer<typeof importReportRowSchema>;

/** What an import would do or did: new contacts, contacts that match someone already there (updated, never duplicated), and skipped rows. */
export const importCountsSchema = z.object({
  newContacts: z.number().int(),
  matchedContacts: z.number().int(),
  skipped: z.number().int(),
});
export type ImportCounts = z.infer<typeof importCountsSchema>;

/** The import as the API answers: progress, the counts and the report. */
export const importSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: importStatusSchema,
  rowCount: z.number().int(),
  /** The column names of the file. */
  headers: z.array(z.string()),
  /** The first few rows, for the preview (only while the file is waiting to be run). */
  sample: z.array(z.array(z.string())),
  /** What each column means now (guessed first, then as the manager set it): a target or null. */
  targets: z.array(z.string().nullable()),
  /** Counts for the mapping (once it is set), and the real counts when the run is done. Null until there is something to say. */
  counts: importCountsSchema.nullable(),
  /** How many rows the run has dealt with so far. */
  processed: z.number().int(),
  report: z.array(importReportRowSchema),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Import = z.infer<typeof importSchema>;

export const importIdParamsSchema = z.object({ id: z.uuid() });

/** What the manager sends to set the columns: one target (or null) for each column, in the file's order. */
export const setImportMappingRequestSchema = z
  .object({ targets: z.array(z.string().min(1).max(80).nullable()).max(MAX_IMPORT_COLUMNS) })
  .strict();
export type SetImportMappingRequest = z.infer<typeof setImportMappingRequestSchema>;

/** Lower case, letters and digits only, so "E-mail", "e mail" and "EMAIL" are the same word. */
function simplify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

const NAME_WORDS = ['name', 'fullname', 'customername', 'contactname', 'customer', 'client', 'clientname', 'guestname'];
const PHONE_WORDS = [
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'cell',
  'cellphone',
  'whatsapp',
  'whatsappnumber',
  'contactnumber',
  'tel',
  'telephone',
];
const EMAIL_WORDS = ['email', 'emailaddress', 'mail', 'emailid'];
const COMPANY_WORDS = [
  'company',
  'companyname',
  'organisation',
  'organization',
  'firm',
  'business',
  'employer',
  'school',
  'institution',
];
const LANGUAGE_WORDS = ['language', 'lang', 'preferredlanguage'];

/** The standard target a column name points to, or null. */
function findStandardTarget(header: string): StandardImportTarget | null {
  const word = simplify(header);
  if (NAME_WORDS.includes(word)) return 'name';
  if (PHONE_WORDS.includes(word)) return 'phone';
  if (EMAIL_WORDS.includes(word)) return 'email';
  if (COMPANY_WORDS.includes(word)) return 'company';
  if (LANGUAGE_WORDS.includes(word)) return 'language';
  return null;
}

/**
 * Guesses what each column is from its name: the usual words for name, phone, email, company and language, and the label or key of one of the business's own
 * contact fields. A target is given to the first column that matches it only (two columns never get the same one). A column it does not know is `null`.
 */
export function guessColumnTargets(
  headers: readonly string[],
  contactFields: readonly FieldDefinition[],
): Array<string | null> {
  const taken = new Set<string>();
  return headers.map((header) => {
    const word = simplify(header);
    let target: string | null = findStandardTarget(header);
    if (target === null && word !== '') {
      const field = contactFields.find(
        (candidate) => simplify(candidate.label) === word || simplify(candidate.key) === word,
      );
      if (field) target = `custom.${field.key}`;
    }
    if (target === null || taken.has(target)) return null;
    taken.add(target);
    return target;
  });
}

/** One problem with a mapping, in words for the person. */
export interface ImportMappingProblem {
  column: number | null;
  message: string;
}

/**
 * Checks the columns the manager chose: one target for each column of the file, only known targets (the standard ones and the business's live contact
 * fields), no target used twice, and at least a phone or an email column (a contact must be reachable). Returns the problems; empty means it is fine. Pure.
 */
export function checkImportMapping(
  targets: ReadonlyArray<string | null>,
  columnCount: number,
  contactFields: readonly FieldDefinition[],
): ImportMappingProblem[] {
  const problems: ImportMappingProblem[] = [];
  if (targets.length !== columnCount) {
    problems.push({ column: null, message: `Send one choice for each of the ${columnCount} columns.` });
    return problems;
  }
  const liveTargets = new Set<string>([
    ...STANDARD_IMPORT_TARGETS,
    ...contactFields.map((field) => `custom.${field.key}`),
  ]);
  const used = new Set<string>();
  for (const [column, target] of targets.entries()) {
    if (target === null) continue;
    if (!liveTargets.has(target)) {
      problems.push({ column, message: 'That is not something an import can fill in.' });
    } else if (used.has(target)) {
      problems.push({ column, message: 'Two columns cannot fill in the same thing.' });
    }
    used.add(target);
  }
  if (!used.has('phone') && !used.has('email')) {
    problems.push({ column: null, message: 'Choose a phone column or an email column: a contact must be reachable.' });
  }
  return problems;
}

/** One row of the file read through the mapping: the details of a contact as plain texts, left out when the cell was empty. */
export interface ReadImportRow {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  language?: string;
  /** Custom answers by field key, as the texts in the file (the shared custom-value check turns them into tidy answers). */
  custom: Record<string, string>;
}

/** Reads one row of cells through the mapping. Cells are trimmed; an empty cell leaves the detail out. Pure. */
export function readImportRow(cells: readonly string[], targets: ReadonlyArray<string | null>): ReadImportRow {
  const row: ReadImportRow = { custom: {} };
  for (const [column, target] of targets.entries()) {
    const text = (cells[column] ?? '').trim();
    if (target === null || text === '') continue;
    if (target.startsWith('custom.')) row.custom[target.slice('custom.'.length)] = text;
    else row[target as StandardImportTarget] = text;
  }
  return row;
}
