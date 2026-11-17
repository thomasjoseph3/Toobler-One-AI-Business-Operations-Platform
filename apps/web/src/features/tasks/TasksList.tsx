import type { Task } from '@toobler-one/shared';
import { Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Tag } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { formatMoment } from '../leads/lead-display';
import { findKindLabelKey, isTaskLate } from './tasks-view';

/** The words for a task's owner: "You", their name, or that they have left. */
function describeOwner(task: Task, signedInUserId: string): string {
  if (task.owner.userId === signedInUserId) return t('tasks.owner.you');
  return task.owner.name ?? t('tasks.owner.removed');
}

/** The due time, with the word "Late" beside it for a late task (never colour alone). */
function DueText({ task, timeZone }: { task: Task; timeZone: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap">{formatMoment(task.dueAt, timeZone)}</span>
      {isTaskLate(task) ? <Tag tone="lost">{t('tasks.late')}</Tag> : null}
    </span>
  );
}

export interface TasksListProps {
  tasks: readonly Task[];
  signedInUserId: string;
  /** The business's time zone, for the due times. */
  timeZone: string;
}

/** The tasks as a table for tablets and desktops: what to do, its kind, who it is about, when it is due and who owns it. */
export function TasksTable({ tasks, signedInUserId, timeZone }: TasksListProps) {
  return (
    <Table className="min-w-[820px]" containerClassName="min-h-0 flex-1 overflow-auto">
      <TableHead>
        <tr>
          <TableHeaderCell>{t('tasks.column.task')}</TableHeaderCell>
          <TableHeaderCell>{t('tasks.column.kind')}</TableHeaderCell>
          <TableHeaderCell>{t('tasks.column.person')}</TableHeaderCell>
          <TableHeaderCell>{t('tasks.column.due')}</TableHeaderCell>
          <TableHeaderCell>{t('tasks.column.owner')}</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="max-w-[300px] break-words text-text-primary">
              {task.title}
              {task.createdByAgent !== null ? (
                <span className="text-body-xs block text-text-secondary">{t('tasks.byAgent')}</span>
              ) : null}
            </TableCell>
            <TableCell>{t(findKindLabelKey(task.kind))}</TableCell>
            <TableCell className="[overflow-wrap:anywhere]">{task.contact.name ?? ''}</TableCell>
            <TableCell>
              <DueText task={task} timeZone={timeZone} />
            </TableCell>
            <TableCell>{describeOwner(task, signedInUserId)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The tasks as a list of cards for a phone, where a wide table would not fit: the same facts, stacked. */
export function TaskCards({ tasks, signedInUserId, timeZone }: TasksListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li key={task.id}>
          <Card isCompact className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-md-semibold min-w-0 break-words text-text-primary">{task.title}</p>
              <Tag tone="neutral">{t(findKindLabelKey(task.kind))}</Tag>
            </div>
            <p className="text-body-sm text-text-secondary">{task.contact.name ?? ''}</p>
            <p className="text-body-xs text-text-secondary">
              <DueText task={task} timeZone={timeZone} /> · {describeOwner(task, signedInUserId)}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
