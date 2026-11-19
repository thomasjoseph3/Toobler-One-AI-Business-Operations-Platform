import type { MailMessage } from '../../../../providers/mail';

// The words of the two task emails: the reminder to the owner before a task is due, and the late alert to the managers after. Pure
// functions (no database, no clock), so each can be tested alone. English only (text channels are English).

/** What the emails say about one task. */
export interface TaskAlertFacts {
  /** What needs doing, as written by staff. */
  title: string;
  /** The person the task is about, or null when they have no name. */
  contactName: string | null;
  /** When it is due, already written in the business's time zone ("17 Nov 2026, 9:00 am"). */
  dueText: string;
  /** The business's name. */
  businessName: string;
}

/** The due time as people read it, in the business's time zone: "17 Nov 2026, 9:00 am". */
export function formatDueText(dueAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(dueAt);
}

/** Makes text safe to put inside the formatted (HTML) version of an email: staff-written words must never become tags. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Builds one email from its lines: the plain-text version and the formatted version say the same thing. */
function buildMail(to: string, subject: string, lines: string[]): MailMessage {
  return {
    to,
    subject,
    text: lines.join('\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
  };
}

/** The reminder to the task's owner, a little before it is due. */
export function buildReminderEmail(options: { to: string; ownerName: string; task: TaskAlertFacts }): MailMessage {
  const { task } = options;
  const about = task.contactName ? ` (about ${task.contactName})` : '';
  return buildMail(options.to, `Reminder: ${task.title}`, [
    `Hello ${options.ownerName},`,
    `This is due soon at ${task.businessName}: ${task.title}${about}.`,
    `Due: ${task.dueText}.`,
    'Tick it off in Toobler One when it is done.',
  ]);
}

/** The late alert to a manager: the task is still open after its due time. */
export function buildLateAlertEmail(options: {
  to: string;
  managerName: string;
  /** The task's owner, or null when they have left. */
  ownerName: string | null;
  task: TaskAlertFacts;
}): MailMessage {
  const { task } = options;
  const about = task.contactName ? ` (about ${task.contactName})` : '';
  const owner = options.ownerName ?? 'nobody (they have left)';
  return buildMail(options.to, `Late task: ${task.title}`, [
    `Hello ${options.managerName},`,
    `A task at ${task.businessName} is still open after its time: ${task.title}${about}.`,
    `It was due: ${task.dueText}.`,
    `Owner: ${owner}.`,
  ]);
}
