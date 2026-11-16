import type { DayOfWeek, WeeklyHoursValue } from '@toobler-one/shared';
import { formatRupees } from '../../offerings';
import type { QuestionDefinition } from './question-types';

// Turns a stored answer to a business question into plain words the AI agent can quote. The agent reads these words, never the stored
// shapes. Pure: no database. An answer that is not in the shape its question expects gives nothing, so a damaged row never reaches a customer.

const DAY_NAMES: readonly { key: DayOfWeek; name: string }[] = [
  { key: 'mon', name: 'Monday' },
  { key: 'tue', name: 'Tuesday' },
  { key: 'wed', name: 'Wednesday' },
  { key: 'thu', name: 'Thursday' },
  { key: 'fri', name: 'Friday' },
  { key: 'sat', name: 'Saturday' },
  { key: 'sun', name: 'Sunday' },
];

/** True when the value is a plain object (not null, not a list). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The opening hours in words, for example "Monday 09:00 to 18:00, Tuesday 09:00 to 18:00. Closed on the other days." */
export function describeWeeklyHours(hours: WeeklyHoursValue): string {
  if ('allDay' in hours) return 'Open all day, every day.';
  const openDays = DAY_NAMES.filter((day) => hours.days[day.key] !== undefined);
  const closedCount = DAY_NAMES.length - openDays.length;
  const openText = openDays
    .map((day) => `${day.name} ${hours.days[day.key]?.open} to ${hours.days[day.key]?.close}`)
    .join(', ');
  return closedCount > 0 ? `${openText}. Closed on the other days.` : `${openText}.`;
}

/** One cell of a list row in words ("Phone: 98..."), or nothing for an empty cell. Prices in a list are paise. */
function describeListCell(label: string, kind: string, cell: unknown): string | undefined {
  if (typeof cell === 'string' && cell !== '') return `${label}: ${cell}`;
  if (typeof cell === 'number' && kind === 'price') return `${label}: ${formatRupees(cell)}`;
  return undefined;
}

/**
 * The answer in plain words, or undefined when it cannot be put into words (nothing stored, a wrong shape, a type the agent does not
 * read such as a file). The question tells the shape to expect.
 */
export function describeAnswerForAgent(question: QuestionDefinition, value: unknown): string | undefined {
  switch (question.type) {
    case 'short_text':
    case 'long_text':
    case 'link':
      return typeof value === 'string' && value !== '' ? value : undefined;
    case 'price':
      return isPlainObject(value) && typeof value.paise === 'number' ? formatRupees(value.paise) : undefined;
    case 'pick_one': {
      if (!isPlainObject(value) || typeof value.choice !== 'string') return undefined;
      return typeof value.otherText === 'string' ? `${value.choice}: ${value.otherText}` : value.choice;
    }
    case 'pick_several': {
      if (!isPlainObject(value) || !Array.isArray(value.choices)) return undefined;
      const choices = value.choices.filter((choice): choice is string => typeof choice === 'string');
      const text = choices.join(', ');
      return typeof value.otherText === 'string' ? `${text} (other: ${value.otherText})` : text || undefined;
    }
    case 'yes_no': {
      if (!isPlainObject(value) || typeof value.yes !== 'boolean') return undefined;
      if (!value.yes) return 'No';
      return typeof value.detail === 'string' ? `Yes. ${value.detail}` : 'Yes';
    }
    case 'weekly_hours': {
      if (isPlainObject(value) && value.allDay === true) return describeWeeklyHours({ allDay: true });
      return isPlainObject(value) && isPlainObject(value.days)
        ? describeWeeklyHours({ days: value.days as Extract<WeeklyHoursValue, { days: unknown }>['days'] })
        : undefined;
    }
    case 'list': {
      if (!isPlainObject(value) || !Array.isArray(value.rows)) return undefined;
      const fields = question.rowFields ?? [];
      const lines = value.rows
        .filter(isPlainObject)
        .map((row) =>
          fields
            .map((field) => describeListCell(field.label, field.kind, row[field.key]))
            .filter((cell): cell is string => cell !== undefined)
            .join('; '),
        )
        .filter((line) => line !== '');
      return lines.length > 0 ? lines.join('\n') : undefined;
    }
    case 'file':
      return undefined;
  }
}
