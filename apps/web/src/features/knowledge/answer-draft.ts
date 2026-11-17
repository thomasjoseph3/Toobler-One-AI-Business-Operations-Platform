import type { DayOfWeek, KnowledgeQuestion, ListRowFieldInfo } from '@toobler-one/shared';

// The shape an answer has while a person is typing it, and how it turns into what the API stores (and back). Pure: no screen, no network.
// The API checks every answer again against its own question; these checks only give quick, friendly messages.

export const DAYS_OF_THE_WEEK: readonly DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OTHER_CHOICE = 'Other';
const DEFAULT_OPENING_TIME = '09:00';
const DEFAULT_CLOSING_TIME = '18:00';

export interface DayDraft {
  isOpen: boolean;
  from: string;
  to: string;
}

export type AnswerDraft =
  | { kind: 'text'; text: string }
  | { kind: 'pick_one'; choice: string; otherText: string }
  | { kind: 'pick_several'; choices: string[]; otherText: string }
  | { kind: 'yes_no'; yes: boolean | null; detail: string }
  | { kind: 'weekly_hours'; isOpenAllDay: boolean; days: Record<DayOfWeek, DayDraft> }
  | { kind: 'list'; rows: Array<Record<string, string>> }
  | { kind: 'price'; rupees: string }
  | { kind: 'not_answerable' };

export type DraftResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Whether a question can be answered by typing here (an upload, or something answered in another feature, cannot). */
export function canBeAnsweredHere(question: KnowledgeQuestion): boolean {
  return question.handledElsewhere === null && question.type !== 'file';
}

const emptyWeek = (): Record<DayOfWeek, DayDraft> => {
  const week = {} as Record<DayOfWeek, DayDraft>;
  for (const day of DAYS_OF_THE_WEEK) week[day] = { isOpen: false, from: DEFAULT_OPENING_TIME, to: DEFAULT_CLOSING_TIME };
  return week;
};

/** Paise (whole) as the rupees a person types: 250000 becomes "2500", 250050 becomes "2500.50". */
export function paiseToRupeesText(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

/** What a person types as rupees ("2,500", "2500.5") as whole paise, or null when it is not a price. Never rounds a part of a paisa. */
export function rupeesTextToPaise(text: string): number | null {
  const cleaned = text.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ''] = cleaned.split('.');
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}

const valueAsRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The draft to start editing a question with: its current answer if it has one, otherwise an empty one of the right kind. */
export function startDraft(question: KnowledgeQuestion, currentValue: unknown): AnswerDraft {
  if (!canBeAnsweredHere(question)) return { kind: 'not_answerable' };
  const stored = valueAsRecord(currentValue);
  switch (question.type) {
    case 'short_text':
    case 'long_text':
    case 'link':
      return { kind: 'text', text: typeof currentValue === 'string' ? currentValue : '' };
    case 'pick_one':
      return {
        kind: 'pick_one',
        choice: typeof stored['choice'] === 'string' ? stored['choice'] : '',
        otherText: typeof stored['otherText'] === 'string' ? stored['otherText'] : '',
      };
    case 'pick_several':
      return {
        kind: 'pick_several',
        choices: Array.isArray(stored['choices']) ? (stored['choices'] as string[]) : [],
        otherText: typeof stored['otherText'] === 'string' ? stored['otherText'] : '',
      };
    case 'yes_no':
      return {
        kind: 'yes_no',
        yes: typeof stored['yes'] === 'boolean' ? stored['yes'] : null,
        detail: typeof stored['detail'] === 'string' ? stored['detail'] : '',
      };
    case 'weekly_hours': {
      const days = emptyWeek();
      const storedDays = valueAsRecord(stored['days']);
      for (const day of DAYS_OF_THE_WEEK) {
        const hours = valueAsRecord(storedDays[day]);
        if (typeof hours['open'] === 'string' && typeof hours['close'] === 'string') {
          days[day] = { isOpen: true, from: hours['open'], to: hours['close'] };
        }
      }
      return { kind: 'weekly_hours', isOpenAllDay: stored['allDay'] === true, days };
    }
    case 'list': {
      const rows = Array.isArray(stored['rows']) ? (stored['rows'] as Array<Record<string, unknown>>) : [];
      return {
        kind: 'list',
        rows: rows.map((row) => {
          const textRow: Record<string, string> = {};
          for (const field of question.rowFields ?? []) {
            const cell = row[field.key];
            textRow[field.key] = field.kind === 'price' && typeof cell === 'number' ? paiseToRupeesText(cell) : String(cell ?? '');
          }
          return textRow;
        }),
      };
    }
    case 'price':
      return { kind: 'price', rupees: typeof stored['paise'] === 'number' ? paiseToRupeesText(stored['paise']) : '' };
    default:
      return { kind: 'not_answerable' };
  }
}

/** An empty row for a list question: every column empty (a pick column starts on its first option). */
export function emptyListRow(fields: readonly ListRowFieldInfo[]): Record<string, string> {
  const row: Record<string, string> = {};
  for (const field of fields) row[field.key] = field.kind === 'pick' ? (field.options?.[0] ?? '') : '';
  return row;
}

const isWebLink = (text: string): boolean => {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Turns what the person typed into the value the API stores, or a plain message saying what to fix. */
export function draftToValue(question: KnowledgeQuestion, draft: AnswerDraft): DraftResult {
  switch (draft.kind) {
    case 'text': {
      const text = draft.text.trim();
      if (text === '') return { ok: false, message: 'Please type an answer.' };
      if (question.type === 'link' && !isWebLink(text)) return { ok: false, message: 'Use a full link like https://example.com' };
      return { ok: true, value: text };
    }
    case 'pick_one': {
      if (draft.choice === '') return { ok: false, message: 'Pick one.' };
      if (draft.choice === OTHER_CHOICE) {
        const otherText = draft.otherText.trim();
        return otherText === '' ? { ok: false, message: 'Say what "Other" is.' } : { ok: true, value: { choice: OTHER_CHOICE, otherText } };
      }
      return { ok: true, value: { choice: draft.choice } };
    }
    case 'pick_several': {
      if (draft.choices.length === 0) return { ok: false, message: 'Pick at least one.' };
      if (question.maxChoices !== null && draft.choices.length > question.maxChoices) {
        return { ok: false, message: `Pick at most ${question.maxChoices}.` };
      }
      if (draft.choices.includes(OTHER_CHOICE)) {
        const otherText = draft.otherText.trim();
        if (otherText === '') return { ok: false, message: 'Say what "Other" is.' };
        return { ok: true, value: { choices: draft.choices, otherText } };
      }
      return { ok: true, value: { choices: draft.choices } };
    }
    case 'yes_no': {
      if (draft.yes === null) return { ok: false, message: 'Pick Yes or No.' };
      if (!draft.yes) return { ok: true, value: { yes: false } };
      const detail = draft.detail.trim();
      if (detail === '') {
        return question.yesDetail?.required
          ? { ok: false, message: `${question.yesDetail.label} is needed for "Yes".` }
          : { ok: true, value: { yes: true } };
      }
      if (question.yesDetail?.kind === 'link' && !isWebLink(detail)) return { ok: false, message: 'Use a full link like https://example.com' };
      return { ok: true, value: { yes: true, detail } };
    }
    case 'weekly_hours': {
      if (draft.isOpenAllDay) return { ok: true, value: { allDay: true } };
      const days: Record<string, { open: string; close: string }> = {};
      for (const day of DAYS_OF_THE_WEEK) {
        const hours = draft.days[day];
        if (!hours.isOpen) continue;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.to)) {
          return { ok: false, message: 'Use times like 09:30.' };
        }
        if (hours.to <= hours.from) return { ok: false, message: 'Closing time must be after opening time.' };
        days[day] = { open: hours.from, close: hours.to };
      }
      if (Object.keys(days).length === 0) return { ok: false, message: 'Open on at least one day, or choose "Open all day".' };
      return { ok: true, value: { days } };
    }
    case 'list': {
      const fields = question.rowFields ?? [];
      const rows: Array<Record<string, string | number>> = [];
      for (const draftRow of draft.rows) {
        const row: Record<string, string | number> = {};
        for (const field of fields) {
          const cell = (draftRow[field.key] ?? '').trim();
          if (cell === '') {
            if (field.required) return { ok: false, message: `${field.label} is needed in every row.` };
            continue;
          }
          if (field.kind === 'price') {
            const paise = rupeesTextToPaise(cell);
            if (paise === null) return { ok: false, message: `${field.label}: use a number like 2500.` };
            row[field.key] = paise;
          } else if (field.kind === 'link' && !isWebLink(cell)) {
            return { ok: false, message: `${field.label}: use a full link like https://example.com` };
          } else {
            row[field.key] = cell;
          }
        }
        if (Object.keys(row).length > 0) rows.push(row);
      }
      if (rows.length === 0) return { ok: false, message: 'Add at least one row.' };
      if (question.maxRows !== null && rows.length > question.maxRows) return { ok: false, message: `At most ${question.maxRows} rows.` };
      return { ok: true, value: { rows } };
    }
    case 'price': {
      const paise = rupeesTextToPaise(draft.rupees);
      return paise === null ? { ok: false, message: 'Use a number like 2500.' } : { ok: true, value: { paise } };
    }
    case 'not_answerable':
      return { ok: false, message: 'This question cannot be answered here.' };
  }
}

const DAY_NAMES: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** An answer as short lines of plain text for showing on the page (one line for most; one per day or row for hours and lists). */
export function formatAnswer(question: KnowledgeQuestion, value: unknown): string[] {
  const stored = valueAsRecord(value);
  switch (question.type) {
    case 'short_text':
    case 'long_text':
    case 'link':
      return typeof value === 'string' ? [value] : [];
    case 'pick_one':
      return [stored['choice'] === OTHER_CHOICE ? String(stored['otherText'] ?? OTHER_CHOICE) : String(stored['choice'] ?? '')];
    case 'pick_several': {
      const choices = Array.isArray(stored['choices']) ? (stored['choices'] as string[]) : [];
      return [choices.map((choice) => (choice === OTHER_CHOICE ? String(stored['otherText'] ?? OTHER_CHOICE) : choice)).join(', ')];
    }
    case 'yes_no':
      return stored['yes'] === true ? [stored['detail'] ? `Yes: ${String(stored['detail'])}` : 'Yes'] : ['No'];
    case 'weekly_hours': {
      if (stored['allDay'] === true) return ['Open all day, every day'];
      const days = valueAsRecord(stored['days']);
      return DAYS_OF_THE_WEEK.map((day) => {
        const hours = valueAsRecord(days[day]);
        return hours['open'] ? `${DAY_NAMES[day]}: ${String(hours['open'])} to ${String(hours['close'])}` : `${DAY_NAMES[day]}: closed`;
      });
    }
    case 'list': {
      const rows = Array.isArray(stored['rows']) ? (stored['rows'] as Array<Record<string, unknown>>) : [];
      return rows.map((row) =>
        (question.rowFields ?? [])
          .map((field) => {
            const cell = row[field.key];
            if (cell === undefined) return null;
            return field.kind === 'price' && typeof cell === 'number' ? `₹${paiseToRupeesText(cell)}` : String(cell);
          })
          .filter((cell): cell is string => cell !== null)
          .join(' · '),
      );
    }
    case 'price':
      return typeof stored['paise'] === 'number' ? [`₹${paiseToRupeesText(stored['paise'])}`] : [];
    default:
      return [];
  }
}
