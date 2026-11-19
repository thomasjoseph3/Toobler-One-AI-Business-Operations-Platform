// What the Tasks list shows (the tab, whose tasks, the page), how that is kept in the web address, and the words for task kinds.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { Task, TaskBucket, TaskKind } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** How many tasks the list shows on a page. */
export const TASKS_PAGE_SIZE = 25;

/** The four tabs in the order they are shown. */
export const TASK_TABS: ReadonlyArray<{ bucket: TaskBucket; labelKey: MessageKey }> = [
  { bucket: 'overdue', labelKey: 'tasks.tab.overdue' },
  { bucket: 'today', labelKey: 'tasks.tab.today' },
  { bucket: 'upcoming', labelKey: 'tasks.tab.upcoming' },
  { bucket: 'done', labelKey: 'tasks.tab.done' },
];

/** The kinds a task can be, with their words (Call, WhatsApp, Email, To-do). */
export const TASK_KIND_CHOICES: ReadonlyArray<{ kind: TaskKind; labelKey: MessageKey }> = [
  { kind: 'call', labelKey: 'tasks.kind.call' },
  { kind: 'whatsapp', labelKey: 'tasks.kind.whatsapp' },
  { kind: 'email', labelKey: 'tasks.kind.email' },
  { kind: 'todo', labelKey: 'tasks.kind.todo' },
];

/** The words for a task kind. */
export function findKindLabelKey(kind: TaskKind): MessageKey {
  return TASK_KIND_CHOICES.find((choice) => choice.kind === kind)?.labelKey ?? 'tasks.kind.todo';
}

/** Whose tasks to show: everyone's, or the signed-in person's own. */
export type TasksOwnerFilter = 'all' | 'me';

export interface TasksView {
  tab: TaskBucket;
  owner: TasksOwnerFilter;
  page: number;
}

/** What staff want first: what is due today. */
export const DEFAULT_TASKS_VIEW: TasksView = { tab: 'today', owner: 'all', page: 1 };

/** Reads the view from the web address (`?tab=overdue&owner=me&page=2`). Anything unknown falls back to the default. */
export function readTasksView(searchParams: URLSearchParams): TasksView {
  const tabText = searchParams.get('tab');
  const tab = TASK_TABS.find((candidate) => candidate.bucket === tabText)?.bucket ?? DEFAULT_TASKS_VIEW.tab;
  const owner: TasksOwnerFilter = searchParams.get('owner') === 'me' ? 'me' : 'all';
  const pageNumber = Number(searchParams.get('page'));
  return { tab, owner, page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1 };
}

/** Writes the view into web address parameters, leaving out what is the default so the address stays short. */
export function writeTasksView(view: TasksView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.tab !== DEFAULT_TASKS_VIEW.tab) searchParams.set('tab', view.tab);
  if (view.owner === 'me') searchParams.set('owner', 'me');
  if (view.page > 1) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address that lists the tasks of a view. */
export function buildTasksPath(view: TasksView): string {
  const parts = [`due=${view.tab}`, `limit=${TASKS_PAGE_SIZE}`];
  if (view.page > 1) parts.push(`page=${view.page}`);
  if (view.owner === 'me') parts.push('owner=me');
  return `/tasks?${parts.join('&')}`;
}

/** The API address that lists the open tasks of one lead (for the lead's own page). */
export function buildLeadTasksPath(leadId: string): string {
  return `/tasks?lead_id=${leadId}&limit=100`;
}

/** How many filters are on (only "my tasks" is a filter; the tab is not). */
export function countActiveTaskFilters(view: TasksView): number {
  return view.owner === 'me' ? 1 : 0;
}

/** The tab number to show beside a tab's name. */
export function readTabCount(counts: Record<TaskBucket, number>, bucket: TaskBucket): number {
  return counts[bucket];
}

/** True when a task is late and still open: its time should show in the warning colour with a word, never colour alone. */
export function isTaskLate(task: Pick<Task, 'bucket'>): boolean {
  return task.bucket === 'overdue';
}
