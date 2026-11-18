import { z } from 'zod';

// Custom fields between the API and the web app: what a business adds to its contacts, companies and leads ("Car model", "Wedding date"), and the one check
// that every value goes through (the API and the AI's tools use the same one, so they can never disagree).

export const fieldObjectSchema = z.enum(['contact', 'company', 'lead']);
export type FieldObject = z.infer<typeof fieldObjectSchema>;

export const fieldTypeSchema = z.enum(['text', 'number', 'date', 'dropdown', 'yes_no', 'phone', 'email']);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** The most live fields one object (contacts, companies or leads) can have. */
export const MAX_FIELDS_PER_OBJECT = 50;
/** The most choices a dropdown can have. */
export const MAX_DROPDOWN_OPTIONS = 30;
/** The longest label, option and text answer. */
export const MAX_FIELD_LABEL_LENGTH = 80;
export const MAX_FIELD_OPTION_LENGTH = 80;
export const MAX_TEXT_ANSWER_LENGTH = 500;

/** One custom field of a business. */
export const fieldDefinitionSchema = z.object({
  id: z.string(),
  object: fieldObjectSchema,
  /** Made from the label when the field is added and never changed, so renaming the label loses nothing. */
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  /** The choices of a dropdown, in order; empty for every other type. */
  options: z.array(z.string()),
  /** Whether the AI asks customers for this field. */
  aiAsks: z.boolean(),
  /** Whether a lead must have it filled before it can be moved to Won (leads only). */
  requiredForWon: z.boolean(),
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/** Turns a label into a key: "Car model" gives "car_model". Letters from other scripts and punctuation are dropped, so a label with none of a-z gives "field". */
export function makeFieldKey(label: string): string {
  const key = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 50)
    .replace(/_+$/u, '');
  if (key === '') return 'field';
  return /^[a-z]/u.test(key) ? key : `f_${key}`;
}

/** The choices of a dropdown, tidied: trimmed, blanks dropped. Two that differ only in capital letters count as the same one (the first is kept). */
export function tidyOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const tidy: string[] = [];
  for (const option of options) {
    const text = option.trim();
    if (text === '' || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    tidy.push(text);
  }
  return tidy;
}

/**
 * What a manager sends to add a field. A dropdown needs 1 to 30 choices and the other types take none. "Required before Won" is for leads only. The
 * type and the object cannot be changed afterwards.
 */
export const createFieldRequestSchema = z
  .object({
    object: fieldObjectSchema,
    label: z.string().trim().min(1).max(MAX_FIELD_LABEL_LENGTH),
    type: fieldTypeSchema,
    options: z.array(z.string().trim().max(MAX_FIELD_OPTION_LENGTH)).max(60).optional(),
    aiAsks: z.boolean().default(false),
    requiredForWon: z.boolean().default(false),
  })
  .strict()
  .superRefine((request, context) => {
    const options = tidyOptions(request.options ?? []);
    if (request.type === 'dropdown') {
      if (options.length === 0) {
        context.addIssue({ code: 'custom', path: ['options'], message: 'A dropdown needs at least one choice.' });
      } else if (options.length > MAX_DROPDOWN_OPTIONS) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: `A dropdown can have at most ${MAX_DROPDOWN_OPTIONS} choices.`,
        });
      }
    } else if (options.length > 0) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'Only a dropdown has choices.' });
    }
    if (request.requiredForWon && request.object !== 'lead') {
      context.addIssue({
        code: 'custom',
        path: ['requiredForWon'],
        message: '“Required before Won” is for leads only.',
      });
    }
  });
export type CreateFieldRequest = z.infer<typeof createFieldRequestSchema>;

/** `GET /fields?object=`: which object's fields (all three when left out). */
export const listFieldsQuerySchema = z.object({ object: fieldObjectSchema.optional() });
export type ListFieldsQuery = z.infer<typeof listFieldsQuerySchema>;

export const fieldsListResponseSchema = z.object({ items: z.array(fieldDefinitionSchema) });
export type FieldsListResponse = z.infer<typeof fieldsListResponseSchema>;

/** A saved answer: text, a number, a plain date ("2026-11-20"), a dropdown choice, yes or no (true or false), a phone or an email. */
export type CustomValue = string | number | boolean;

/** What went wrong with one answer, in plain words, and which field it was for. */
export interface CustomValueProblem {
  key: string;
  message: string;
}

/** The result of checking some answers: the tidy ones to save (an empty answer removes its key), and what was refused. */
export interface CustomValuesCheck {
  values: Record<string, CustomValue | null>;
  problems: CustomValueProblem[];
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Whether this is a real calendar date written as "2026-11-20". */
function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Checks one answer against its field. Returns the tidy answer (null means "nothing"), or the problem in words. */
function checkOneValue(definition: FieldDefinition, raw: unknown): { value: CustomValue | null } | { problem: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  const label = definition.label;
  switch (definition.type) {
    case 'text': {
      if (typeof raw !== 'string') return { problem: `${label} needs words.` };
      const text = raw.trim();
      return text.length > MAX_TEXT_ANSWER_LENGTH
        ? { problem: `${label} can have at most ${MAX_TEXT_ANSWER_LENGTH} characters.` }
        : { value: text };
    }
    case 'number': {
      const number =
        typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(/,/gu, '')) : Number.NaN;
      return Number.isFinite(number) && Math.abs(number) <= 1e15
        ? { value: number }
        : { problem: `${label} needs a number.` };
    }
    case 'date':
      return typeof raw === 'string' && isRealDate(raw.trim())
        ? { value: raw.trim() }
        : { problem: `${label} needs a date like 2026-11-20.` };
    case 'dropdown': {
      if (typeof raw !== 'string') return { problem: `${label} needs one of the choices.` };
      const choice = definition.options.find((option) => option.toLowerCase() === raw.trim().toLowerCase());
      return choice !== undefined
        ? { value: choice }
        : { problem: `${label} needs one of: ${definition.options.join(', ')}.` };
    }
    case 'yes_no': {
      if (typeof raw === 'boolean') return { value: raw };
      const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (['yes', 'true', 'y'].includes(word)) return { value: true };
      if (['no', 'false', 'n'].includes(word)) return { value: false };
      return { problem: `${label} needs yes or no.` };
    }
    case 'phone': {
      if (typeof raw !== 'string' || !/^\+?[\d\s\-()]+$/u.test(raw.trim()))
        return { problem: `${label} needs a phone number.` };
      const digitCount = raw.replace(/\D/gu, '').length;
      return digitCount >= 7 && digitCount <= 15
        ? { value: raw.trim() }
        : { problem: `${label} needs a phone number.` };
    }
    case 'email': {
      if (typeof raw !== 'string') return { problem: `${label} needs an email address.` };
      const email = raw.trim().toLowerCase();
      return EMAIL_SHAPE.test(email) && email.length <= 254
        ? { value: email }
        : { problem: `${label} needs an email address.` };
    }
  }
}

/**
 * The one check every custom answer goes through (the API and the AI's tools both call it). `definitions` are the object's LIVE fields. Each answer is
 * checked against its field by type; an empty answer (null, or blank text) means "nothing" and is returned as `null` so the caller removes the key.
 * An answer for a key that is not a live field of the object is refused, so nobody can write to a removed field or invent one.
 */
export function validateCustomValues(
  definitions: readonly FieldDefinition[],
  answers: Readonly<Record<string, unknown>>,
): CustomValuesCheck {
  const values: Record<string, CustomValue | null> = {};
  const problems: CustomValueProblem[] = [];
  for (const [key, raw] of Object.entries(answers)) {
    const definition = definitions.find((candidate) => candidate.key === key);
    if (!definition) {
      problems.push({ key, message: 'There is no such field.' });
      continue;
    }
    const checked = checkOneValue(definition, raw);
    if ('problem' in checked) problems.push({ key, message: checked.problem });
    else values[key] = checked.value;
  }
  return { values, problems };
}
