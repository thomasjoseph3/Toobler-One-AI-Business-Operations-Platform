// The public face of the tasks module: the only file other modules may import from it.
// The activities module (F07) reads a task's words through it to write "added the task ..." on a timeline.
export { findTaskSummary } from './services/task-summaries.service';
export type { TaskSummary } from './services/task-summaries.service';
// The duplicates module (F13) moves a merged-away contact's tasks to the kept contact.
export { moveTasksToContact } from './services/contact-merge.service';
// The Today module (F22) reads the business's open tasks to fill its Late and Due-today sections.
export { findOpenTasksForToday } from './services/today-tasks.service';
export type { OpenTaskRow } from './services/today-tasks.service';
