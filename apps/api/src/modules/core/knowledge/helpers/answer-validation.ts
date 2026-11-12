import { weeklyHoursValueSchema } from '@toobler-one/shared';
import { z } from 'zod';
import type { ListRowField, QuestionDefinition } from './question-types';

// Checks one answer against its question. Pure: no database. A good answer comes back cleaned up (trimmed, in the shape
// stored); a bad one comes back with a message in plain words for the person typing.

export type AnswerCheckResult = { ok: true; value: unknown } | { ok: false; message: string };

const SHORT_TEXT_MAX = 200;
const LONG_TEXT_MAX = 2000;
const LINK_MAX = 500;
const DEFAULT_MAX_ROWS = 20;
const OTHER_CHOICE = 'Other';

/** A GST number: 15 characters, two digits, five letters, four digits, a letter, then entity, "Z" and a check character. */
const GST_NUMBER_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** True when the text is a web link starting with http:// or https://. Never throws. */
function isWebLink(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const shortTextSchema = z.string().trim().min(1, 'Please type an answer').max(SHORT_TEXT_MAX, 'That is too long');
const longTextSchema = z.string().trim().min(1, 'Please type an answer').max(LONG_TEXT_MAX, 'That is too long');
const linkSchema = z
  .string()
  .trim()
  .max(LINK_MAX, 'That link is too long')
  .refine(isWebLink, 'Use a full link like https://example.com');
const otherTextSchema = z.string().trim().min(1, 'Say what "Other" is').max(SHORT_TEXT_MAX, 'That is too long');
const priceSchema = z.object({ paise: z.number().int('Use whole paise').min(0).max(1_000_000_000_000) }).strict();

/** The first message of a zod failure, in plain words. */
function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'That answer is not valid';
}

/** Checks one column of one row of a list answer. */
function checkRowField(field: ListRowField, rawValue: unknown): AnswerCheckResult {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return field.required ? { ok: false, message: `${field.label} is needed` } : { ok: true, value: undefined };
  }
  if (field.kind === 'price') {
    const parsedPrice = z.number().int().min(0).max(1_000_000_000_000).safeParse(rawValue);
    return parsedPrice.success
      ? { ok: true, value: parsedPrice.data }
      : { ok: false, message: `${field.label}: use whole paise` };
  }
  const schema = field.kind === 'link' ? linkSchema : field.kind === 'long_text' ? longTextSchema : shortTextSchema;
  const parsed = schema.safeParse(rawValue);
  if (!parsed.success) return { ok: false, message: `${field.label}: ${firstMessage(parsed.error)}` };
  if (field.kind === 'pick' && !(field.options ?? []).includes(parsed.data)) {
    return { ok: false, message: `${field.label}: pick one of ${(field.options ?? []).join(', ')}` };
  }
  return { ok: true, value: parsed.data };
}

/** Checks a "list" answer: { rows: [ { column: value, ... }, ... ] }. */
function checkList(question: QuestionDefinition, rawValue: unknown): AnswerCheckResult {
  const fields = question.rowFields;
  if (!fields) return { ok: false, message: 'This question is answered elsewhere' };
  const maxRows = question.maxRows ?? DEFAULT_MAX_ROWS;
  const parsed = z
    .object({
      rows: z
        .array(z.record(z.string(), z.unknown()))
        .min(1, 'Add at least one row')
        .max(maxRows, `At most ${maxRows} rows`),
    })
    .strict()
    .safeParse(rawValue);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };

  const knownColumns = new Set(fields.map((field) => field.key));
  const cleanedRows: Array<Record<string, string | number>> = [];
  for (const [rowIndex, row] of parsed.data.rows.entries()) {
    const unknownColumn = Object.keys(row).find((column) => !knownColumns.has(column));
    if (unknownColumn) return { ok: false, message: `Row ${rowIndex + 1}: "${unknownColumn}" is not a column` };
    const cleanedRow: Record<string, string | number> = {};
    for (const field of fields) {
      const result = checkRowField(field, row[field.key]);
      if (!result.ok) return { ok: false, message: `Row ${rowIndex + 1}: ${result.message}` };
      if (result.value !== undefined) cleanedRow[field.key] = result.value as string | number;
    }
    cleanedRows.push(cleanedRow);
  }
  return { ok: true, value: { rows: cleanedRows } };
}

/** Checks a "pick one" answer: { choice, otherText? }. */
function checkPickOne(question: QuestionDefinition, rawValue: unknown): AnswerCheckResult {
  const options = question.options ?? [];
  const parsed = z
    .object({ choice: z.string().trim().min(1), otherText: otherTextSchema.optional() })
    .strict()
    .safeParse(rawValue);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
  const { choice, otherText } = parsed.data;
  if (choice === OTHER_CHOICE && question.allowOther) {
    return otherText ? { ok: true, value: { choice, otherText } } : { ok: false, message: 'Say what "Other" is' };
  }
  if (!options.includes(choice)) return { ok: false, message: `Pick one of ${options.join(', ')}` };
  if (otherText) return { ok: false, message: 'Only "Other" takes extra words' };
  return { ok: true, value: { choice } };
}

/** Checks a "pick several" answer: { choices: [...], otherText? }. */
function checkPickSeveral(question: QuestionDefinition, rawValue: unknown): AnswerCheckResult {
  const options = question.options ?? [];
  const parsed = z
    .object({
      choices: z.array(z.string().trim().min(1)).min(1, 'Pick at least one'),
      otherText: otherTextSchema.optional(),
    })
    .strict()
    .safeParse(rawValue);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
  const choices = [...new Set(parsed.data.choices)];
  const otherPicked = choices.includes(OTHER_CHOICE) && question.allowOther === true;
  const unknownChoice = choices.find(
    (choice) => !options.includes(choice) && !(otherPicked && choice === OTHER_CHOICE),
  );
  if (unknownChoice) return { ok: false, message: `"${unknownChoice}" is not one of ${options.join(', ')}` };
  if (question.maxChoices !== undefined && choices.length > question.maxChoices) {
    return { ok: false, message: `Pick at most ${question.maxChoices}` };
  }
  if (otherPicked && !parsed.data.otherText) return { ok: false, message: 'Say what "Other" is' };
  if (!otherPicked && parsed.data.otherText) return { ok: false, message: 'Only "Other" takes extra words' };
  return { ok: true, value: { choices, ...(parsed.data.otherText ? { otherText: parsed.data.otherText } : {}) } };
}

/** Checks a yes or no answer: { yes, detail? }. A "No" drops any detail; a "Yes" may need a link or words. */
function checkYesNo(question: QuestionDefinition, rawValue: unknown): AnswerCheckResult {
  const parsed = z
    .object({ yes: z.boolean(), detail: z.string().trim().max(LONG_TEXT_MAX).optional() })
    .strict()
    .safeParse(rawValue);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
  const { yes, detail } = parsed.data;
  if (!yes) return { ok: true, value: { yes: false } };
  const detailRule = question.yesDetail;
  if (!detail) {
    return detailRule?.required
      ? { ok: false, message: `${detailRule.label} is needed for "Yes"` }
      : { ok: true, value: { yes: true } };
  }
  if (!detailRule) return { ok: false, message: 'This question takes only Yes or No' };
  if (detailRule.kind === 'link' && !isWebLink(detail))
    return { ok: false, message: 'Use a full link like https://example.com' };
  return { ok: true, value: { yes: true, detail } };
}

/**
 * Checks an answer to one question. `rawValue` is whatever was sent. Returns the cleaned value to store, or a message saying
 * what is wrong. A "file" question cannot be answered here (uploads arrive with the documents feature).
 */
export function checkAnswer(question: QuestionDefinition, rawValue: unknown): AnswerCheckResult {
  if (question.handledElsewhere) {
    return { ok: false, message: `This is answered in ${question.handledElsewhere}, not here` };
  }
  switch (question.type) {
    case 'short_text': {
      const parsed = shortTextSchema.safeParse(rawValue);
      if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
      if (question.check === 'gst_number') {
        const gstNumber = parsed.data.toUpperCase().replaceAll(' ', '');
        return GST_NUMBER_PATTERN.test(gstNumber)
          ? { ok: true, value: gstNumber }
          : { ok: false, message: 'A GST number has 15 characters, like 32ABCDE1234F1Z5' };
      }
      return { ok: true, value: parsed.data };
    }
    case 'long_text': {
      const parsed = longTextSchema.safeParse(rawValue);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: firstMessage(parsed.error) };
    }
    case 'link': {
      const parsed = linkSchema.safeParse(rawValue);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: firstMessage(parsed.error) };
    }
    case 'price': {
      const parsed = priceSchema.safeParse(rawValue);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: firstMessage(parsed.error) };
    }
    case 'pick_one':
      return checkPickOne(question, rawValue);
    case 'pick_several':
      return checkPickSeveral(question, rawValue);
    case 'yes_no':
      return checkYesNo(question, rawValue);
    case 'weekly_hours': {
      const parsed = weeklyHoursValueSchema.safeParse(rawValue);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: firstMessage(parsed.error) };
    }
    case 'list':
      return checkList(question, rawValue);
    case 'file':
      return { ok: false, message: 'Uploads arrive with the documents feature' };
  }
}
