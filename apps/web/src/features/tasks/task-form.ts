// The rules of the Add task form: what is chosen or typed, checking it, and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { CreateTaskRequest, TaskKind } from '@toobler-one/shared';
import { MAX_TASK_TITLE_LENGTH } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';
import { suggestDueWallClock, wallClockToIsoMoment } from './zoned-time';

/** Everything chosen or typed in the Add task form. */
export interface TaskFormFields {
  /** The person the task is about, chosen by searching; null until one is chosen (not used when the task is for a given lead). */
  contactId: string | null;
  kind: TaskKind;
  title: string;
  /** The due day as the date box holds it ("2026-11-17"), in the business's time zone. */
  dueDate: string;
  /** The due time as the time box holds it ("09:30"), in the business's time zone. */
  dueTime: string;
}

/** The starting form: a to-do due at the next whole hour in the business's time zone. */
export function buildEmptyTaskForm(now: Date, timeZone: string): TaskFormFields {
  const due = suggestDueWallClock(now, timeZone);
  return { contactId: null, kind: 'todo', title: '', dueDate: due.date, dueTime: due.time };
}

/** What is wrong with the form, as the words to show under the box. A box that is fine has no entry. */
export interface TaskFormProblems {
  contact?: MessageKey;
  title?: MessageKey;
  due?: MessageKey;
}

/** Checks the form on the device first: a person (unless the task is for a given lead), the words, and a real date and time. */
export function checkTaskForm(
  fields: TaskFormFields,
  options: { needsContact: boolean; timeZone: string },
): TaskFormProblems {
  const problems: TaskFormProblems = {};
  if (options.needsContact && fields.contactId === null) problems.contact = 'tasks.form.needContact';
  if (fields.title.trim() === '') problems.title = 'tasks.form.needTitle';
  else if (fields.title.trim().length > MAX_TASK_TITLE_LENGTH) problems.title = 'tasks.form.titleTooLong';
  if (wallClockToIsoMoment(fields.dueDate, fields.dueTime, options.timeZone) === null)
    problems.due = 'tasks.form.needDue';
  return problems;
}

/**
 * Turns the checked form into the request body: for the given lead, or for the chosen person. Call it only after `checkTaskForm`
 * found nothing.
 */
export function buildCreateTaskRequest(
  fields: TaskFormFields,
  target: { leadId: string } | { contactId: string },
  timeZone: string,
): CreateTaskRequest {
  return {
    ...target,
    kind: fields.kind,
    title: fields.title.trim(),
    dueAt: wallClockToIsoMoment(fields.dueDate, fields.dueTime, timeZone) ?? '',
  };
}
