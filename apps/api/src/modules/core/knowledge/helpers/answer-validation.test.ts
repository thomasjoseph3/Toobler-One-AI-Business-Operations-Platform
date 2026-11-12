import { describe, expect, it } from 'vitest';
import { checkAnswer } from './answer-validation';
import { GENERAL_QUESTIONS } from './general-questions';
import { INDUSTRY_QUESTIONS } from './industry-questions';
import type { QuestionDefinition } from './question-types';

/** A question of the general list, by key. */
function questionNamed(key: string): QuestionDefinition {
  const question = [...GENERAL_QUESTIONS, ...Object.values(INDUSTRY_QUESTIONS).flat()].find(
    (candidate) => candidate.key === key,
  );
  if (!question) throw new Error(`No question named ${key}`);
  return question;
}

/** The cleaned value of an answer that must be accepted. */
function accepted(key: string, value: unknown): unknown {
  const result = checkAnswer(questionNamed(key), value);
  if (!result.ok) throw new Error(`${key} was refused: ${result.message}`);
  return result.value;
}

/** The message of an answer that must be refused. */
function refusal(key: string, value: unknown): string {
  const result = checkAnswer(questionNamed(key), value);
  if (result.ok) throw new Error(`${key} was accepted: ${JSON.stringify(result.value)}`);
  return result.message;
}

describe('short and long text', () => {
  it('trims, and refuses empty, blank and too long text', () => {
    expect(accepted('business_name', '  Nair Stays  ')).toBe('Nair Stays');
    expect(refusal('business_name', '   ')).toMatch(/type an answer/i);
    expect(refusal('business_name', 'x'.repeat(201))).toMatch(/too long/i);
    expect(refusal('business_name', 42)).toBeTruthy();
    expect(refusal('business_name', null)).toBeTruthy();
    expect(accepted('address', 'Near the beach\nOpposite the old lighthouse')).toContain('lighthouse');
    expect(refusal('address', 'x'.repeat(2001))).toMatch(/too long/i);
  });
});

describe('the GST number', () => {
  it('accepts a well-formed number in any capitals and spacing, and keeps it in capitals', () => {
    expect(accepted('gst_number', '32abcde1234f1z5')).toBe('32ABCDE1234F1Z5');
    expect(accepted('gst_number', ' 32ABCDE1234F1Z5 ')).toBe('32ABCDE1234F1Z5');
  });

  it('refuses numbers of the wrong shape', () => {
    for (const bad of ['', '12345', '32ABCDE1234F1Y5', 'ABCDE1234F', '32ABCDE1234F1Z', '32ABCDE1234F1Z55']) {
      expect(refusal('gst_number', bad), bad).toBeTruthy();
    }
  });
});

describe('pick one', () => {
  it('accepts one of the options and refuses anything else', () => {
    expect(accepted('prices_include_gst', { choice: 'Plus GST' })).toEqual({ choice: 'Plus GST' });
    expect(refusal('prices_include_gst', { choice: 'Maybe' })).toMatch(/pick one of/i);
    expect(refusal('prices_include_gst', 'Plus GST')).toBeTruthy();
    expect(refusal('prices_include_gst', { choice: 'Plus GST', extra: 1 })).toBeTruthy();
    expect(refusal('prices_include_gst', { choice: 'Plus GST', otherText: 'words' })).toMatch(/only "other"/i);
  });
});

describe('pick several', () => {
  it('accepts several options, once each', () => {
    expect(accepted('payment_methods', { choices: ['UPI', 'Cash', 'UPI'] })).toEqual({ choices: ['UPI', 'Cash'] });
    expect(refusal('payment_methods', { choices: [] })).toMatch(/at least one/i);
    expect(refusal('payment_methods', { choices: ['Bitcoin'] })).toMatch(/not one of/i);
  });

  it('takes "Other" with words only where the question allows it', () => {
    expect(accepted('usual_customers', { choices: ['Families', 'Other'], otherText: 'Pilgrims' })).toEqual({
      choices: ['Families', 'Other'],
      otherText: 'Pilgrims',
    });
    expect(refusal('usual_customers', { choices: ['Other'] })).toMatch(/say what/i);
    expect(refusal('usual_customers', { choices: ['Families'], otherText: 'Pilgrims' })).toMatch(/only "other"/i);
    expect(refusal('payment_methods', { choices: ['Other'], otherText: 'Barter' })).toMatch(/not one of/i);
  });

  it('keeps to the most that may be picked', () => {
    expect(accepted('top_priorities', { choices: ['Call back faster', 'Know which leads are hot'] })).toBeTruthy();
    expect(
      refusal('top_priorities', {
        choices: ['Call back faster', 'Know which leads are hot', 'Answer every enquiry'],
      }),
    ).toMatch(/at most 2/i);
  });
});

describe('yes or no', () => {
  it('needs the link for "Yes" when the question asks for one, and checks it is a web link', () => {
    expect(accepted('has_website', { yes: true, detail: 'https://nairstays.example' })).toEqual({
      yes: true,
      detail: 'https://nairstays.example',
    });
    expect(refusal('has_website', { yes: true })).toMatch(/needed/i);
    expect(refusal('has_website', { yes: true, detail: 'nairstays' })).toMatch(/full link/i);
    expect(refusal('has_website', { yes: true, detail: 'javascript:alert(1)' })).toMatch(/full link/i);
  });

  it('drops any detail from a "No"', () => {
    expect(accepted('has_website', { yes: false, detail: 'ignored' })).toEqual({ yes: false });
  });

  it('takes words for "Yes" where the question allows, and where they are optional', () => {
    expect(accepted('seasonal_prices', { yes: true, detail: 'Higher in Dec to Jan' })).toEqual({
      yes: true,
      detail: 'Higher in Dec to Jan',
    });
    expect(refusal('seasonal_prices', { yes: true })).toMatch(/needed/i);
    expect(accepted('hotel_pets', { yes: true })).toEqual({ yes: true });
    expect(accepted('hotel_pets', { yes: true, detail: 'Small dogs only' })).toEqual({
      yes: true,
      detail: 'Small dogs only',
    });
    expect(refusal('hotel_pets', { yes: 'sure' })).toBeTruthy();
  });
});

describe('weekly hours', () => {
  it('accepts open all day, and a list of open days with times', () => {
    expect(accepted('opening_hours', { allDay: true })).toEqual({ allDay: true });
    const hours = { days: { mon: { open: '09:00', close: '21:00' }, sat: { open: '10:00', close: '14:00' } } };
    expect(accepted('opening_hours', hours)).toEqual(hours);
  });

  it('refuses nonsense: no open day, a closing time before the opening time, a bad time or day', () => {
    expect(refusal('opening_hours', { days: {} })).toMatch(/at least one day/i);
    expect(refusal('opening_hours', { days: { mon: { open: '21:00', close: '09:00' } } })).toMatch(/after opening/i);
    expect(refusal('opening_hours', { days: { mon: { open: '9am', close: '9pm' } } })).toMatch(/time like/i);
    expect(refusal('opening_hours', { days: { mon: { open: '24:00', close: '25:00' } } })).toBeTruthy();
    expect(refusal('opening_hours', { days: { funday: { open: '09:00', close: '21:00' } } })).toBeTruthy();
    expect(refusal('opening_hours', { allDay: false })).toBeTruthy();
    expect(refusal('opening_hours', {})).toBeTruthy();
  });
});

describe('lists', () => {
  it('accepts rows with the right columns and keeps only what was sent', () => {
    const value = {
      rows: [
        { kind: 'Phone', value: '+91 98470 12345' },
        { kind: 'Email', value: 'stay@nair.example' },
      ],
    };
    expect(accepted('contact_details', value)).toEqual(value);
  });

  it('refuses no rows, too many rows, a missing needed column, a wrong pick, an unknown column and a bad link', () => {
    expect(refusal('contact_details', { rows: [] })).toMatch(/at least one row/i);
    expect(refusal('competitors', { rows: Array.from({ length: 4 }, () => ({ link: 'https://a.example' })) })).toMatch(
      /at most 3/i,
    );
    expect(refusal('contact_details', { rows: [{ kind: 'Phone' }] })).toMatch(/row 1.*needed/i);
    expect(refusal('contact_details', { rows: [{ kind: 'Fax', value: '1' }] })).toMatch(/row 1.*pick one of/i);
    expect(refusal('contact_details', { rows: [{ kind: 'Phone', value: '1', note: 'x' }] })).toMatch(/not a column/i);
    expect(refusal('competitors', { rows: [{ link: 'not a link' }] })).toMatch(/full link/i);
    expect(refusal('contact_details', [{ kind: 'Phone', value: '1' }])).toBeTruthy();
  });

  it('allows an optional column to be left out, and checks the ones given', () => {
    expect(accepted('hotel_room_types', { rows: [{ name: 'Deluxe' }] })).toEqual({ rows: [{ name: 'Deluxe' }] });
    expect(accepted('hotel_room_types', { rows: [{ name: 'Deluxe', details: 'Sea view' }] })).toBeTruthy();
    expect(refusal('hotel_room_types', { rows: [{ details: 'No name' }] })).toMatch(/needed/i);
  });
});

describe('prices and links', () => {
  it('keeps a price in whole paise', () => {
    expect(accepted('clinic_consultation_fee', { paise: 50_000 })).toEqual({ paise: 50_000 });
    expect(refusal('clinic_consultation_fee', { paise: 500.5 })).toBeTruthy();
    expect(refusal('clinic_consultation_fee', { paise: -1 })).toBeTruthy();
    expect(refusal('clinic_consultation_fee', 500)).toBeTruthy();
  });
});

describe('questions that cannot be answered here', () => {
  it('refuses a question that is answered in another feature, whatever is sent', () => {
    expect(refusal('offerings', { rows: [{ name: 'Room' }] })).toMatch(/answered in offerings/i);
    expect(refusal('common_questions', { rows: [] })).toMatch(/answered in faqs/i);
    expect(refusal('brochure_upload', 'file.pdf')).toMatch(/answered in documents/i);
  });
});
