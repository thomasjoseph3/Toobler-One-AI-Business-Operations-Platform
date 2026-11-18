import { describe, expect, it } from 'vitest';
import {
  createFieldRequestSchema,
  makeFieldKey,
  tidyOptions,
  validateCustomValues,
  type FieldDefinition,
} from './custom-fields';

const field = (type: FieldDefinition['type'], overrides: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: `id-${type}`,
  object: 'lead',
  key: type,
  label: `A ${type}`,
  type,
  options: type === 'dropdown' ? ['Swift', 'Baleno', 'Brezza'] : [],
  aiAsks: false,
  requiredForWon: false,
  ...overrides,
});
const ALL = (['text', 'number', 'date', 'dropdown', 'yes_no', 'phone', 'email'] as const).map((type) => field(type));

describe('makeFieldKey', () => {
  it('makes a key from the label', () => {
    expect(makeFieldKey('Car model')).toBe('car_model');
    expect(makeFieldKey('  Wedding date!! ')).toBe('wedding_date');
    expect(makeFieldKey('Café & Bar')).toBe('cafe_bar');
  });

  it('keeps it a valid key: starts with a letter, never empty, not too long', () => {
    expect(makeFieldKey('2nd guest')).toBe('f_2nd_guest');
    expect(makeFieldKey('നായർ')).toBe('field');
    expect(makeFieldKey('x'.repeat(200)).length).toBeLessThanOrEqual(50);
  });
});

describe('tidyOptions', () => {
  it('trims, drops blanks and repeats that differ only in capitals, keeping order', () => {
    expect(tidyOptions([' Swift ', '', 'swift', 'Baleno', ' ', 'BALENO', 'Brezza'])).toEqual([
      'Swift',
      'Baleno',
      'Brezza',
    ]);
  });
});

describe('createFieldRequestSchema', () => {
  const base = { object: 'lead', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] };

  it('accepts a dropdown with choices, and fills in the two switches as off', () => {
    const parsed = createFieldRequestSchema.parse(base);
    expect(parsed).toMatchObject({ aiAsks: false, requiredForWon: false });
  });

  it('refuses a dropdown with no usable choices, too many choices, and choices on another type', () => {
    expect(createFieldRequestSchema.safeParse({ ...base, options: [] }).success).toBe(false);
    expect(createFieldRequestSchema.safeParse({ ...base, options: [' ', ''] }).success).toBe(false);
    expect(
      createFieldRequestSchema.safeParse({
        ...base,
        options: Array.from({ length: 31 }, (_, index) => `Choice ${index}`),
      }).success,
    ).toBe(false);
    expect(createFieldRequestSchema.safeParse({ ...base, type: 'text' }).success).toBe(false);
    expect(createFieldRequestSchema.safeParse({ object: 'lead', label: 'Notes', type: 'text' }).success).toBe(true);
  });

  it('allows "required before Won" on leads only, and refuses unknown fields', () => {
    expect(
      createFieldRequestSchema.safeParse({ object: 'lead', label: 'Budget', type: 'number', requiredForWon: true })
        .success,
    ).toBe(true);
    expect(
      createFieldRequestSchema.safeParse({ object: 'contact', label: 'Budget', type: 'number', requiredForWon: true })
        .success,
    ).toBe(false);
    expect(
      createFieldRequestSchema.safeParse({ object: 'lead', label: 'Budget', type: 'number', key: 'x' }).success,
    ).toBe(false);
  });
});

describe('validateCustomValues', () => {
  const check = (answers: Record<string, unknown>) => validateCustomValues(ALL, answers);

  it('accepts a good answer of each type and tidies it', () => {
    const result = check({
      text: '  Prefers mornings ',
      number: '1,250.5',
      date: '2026-11-20',
      dropdown: 'brezza',
      yes_no: 'Yes',
      phone: '+91 98470 12345',
      email: ' Priya@Example.COM ',
    });
    expect(result.problems).toEqual([]);
    expect(result.values).toEqual({
      text: 'Prefers mornings',
      number: 1250.5,
      date: '2026-11-20',
      dropdown: 'Brezza',
      yes_no: true,
      phone: '+91 98470 12345',
      email: 'priya@example.com',
    });
  });

  it('turns an empty answer into null, so the caller removes it', () => {
    expect(check({ text: '', number: null, date: '   ' }).values).toEqual({ text: null, number: null, date: null });
  });

  it('refuses a bad answer of each type with a plain sentence naming the field', () => {
    const problems = check({
      text: 'x'.repeat(501),
      number: 'many',
      date: '2026-02-30',
      dropdown: 'Ertiga',
      yes_no: 'maybe',
      phone: '12',
      email: 'not-an-email',
    }).problems;
    expect(problems.map((problem) => problem.key)).toEqual([
      'text',
      'number',
      'date',
      'dropdown',
      'yes_no',
      'phone',
      'email',
    ]);
    expect(problems.find((problem) => problem.key === 'dropdown')?.message).toBe(
      'A dropdown needs one of: Swift, Baleno, Brezza.',
    );
  });

  it('refuses a key that is not a live field, so nothing can be written to a removed or invented field', () => {
    const result = check({ car_model: 'Swift' });
    expect(result.problems).toEqual([{ key: 'car_model', message: 'There is no such field.' }]);
    expect(result.values).toEqual({});
  });

  it('keeps a real yes or no as a boolean, and numbers as numbers', () => {
    expect(check({ yes_no: false, number: 0 }).values).toEqual({ yes_no: false, number: 0 });
  });
});
