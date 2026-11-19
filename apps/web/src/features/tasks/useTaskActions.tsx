import { useState, type ReactNode } from 'react';
import type { Task } from '@toobler-one/shared';
import { ActionMenu, Alert, Button, ConfirmDialog, type ActionMenuItem } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeTaskChangeProblem } from './task-problem';
import { computeSnoozeMoment, SNOOZE_CHOICES } from './task-snooze';

/**
 * What staff can do with a task in a list: tick it off or open it again, snooze it, edit it (the page opens its form) and delete it
 * (after "Are you sure?"). Each action calls the API and then `onChanged`, so the page loads its tasks again. A refusal is shown in words
 * (`problemNotice`) above the list. Gives back the pieces a page draws: the row menu, the dialogs and the notice.
 */
export function useTaskActions(options: { timeZone: string; onChanged: () => void; onEdit: (task: Task) => void }): {
  toggleDone: (task: Task) => Promise<void>;
  renderRowMenu: (task: Task) => ReactNode;
  problemNotice: ReactNode;
  dialogs: ReactNode;
} {
  const { timeZone, onChanged, onEdit } = options;
  const [problem, setProblem] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sends one change to a task and loads the list again; says in words when it did not work
  const changeTask = async (task: Task, body: Record<string, unknown>) => {
    try {
      await apiRequest('PATCH', `/tasks/${task.id}`, body);
      setProblem(null);
    } catch (error) {
      setProblem(describeTaskChangeProblem(error));
    }
    onChanged();
  };

  // Deletes the task the person said yes to
  const confirmDelete = async () => {
    if (taskToDelete === null) return;
    setIsDeleting(true);
    try {
      await apiRequest('DELETE', `/tasks/${taskToDelete.id}`);
      setProblem(null);
    } catch (error) {
      setProblem(describeTaskChangeProblem(error));
    }
    setIsDeleting(false);
    setTaskToDelete(null);
    onChanged();
  };

  // The "…" menu of one task: Edit, the snooze choices (not for a finished task) and Delete
  const renderRowMenu = (task: Task): ReactNode => {
    const items: ActionMenuItem[] = [{ id: 'edit', label: t('tasks.menu.edit'), onSelect: () => onEdit(task) }];
    if (task.bucket !== 'done') {
      for (const snooze of SNOOZE_CHOICES) {
        items.push({
          id: `snooze-${snooze.choice}`,
          label: t(snooze.labelKey),
          group: 'snooze',
          onSelect: () => void changeTask(task, { dueAt: computeSnoozeMoment(snooze.choice, new Date(), timeZone) }),
        });
      }
    }
    items.push({
      id: 'delete',
      label: t('tasks.menu.delete'),
      tone: 'danger',
      group: 'delete',
      onSelect: () => setTaskToDelete(task),
    });
    return (
      <ActionMenu
        triggerLabel={formatMessage('tasks.row.moreFor', { title: task.title })}
        panelLabel={t('tasks.row.actions')}
        items={items}
        groupHeadings={{ snooze: t('tasks.snooze.heading') }}
      />
    );
  };

  return {
    toggleDone: (task) => changeTask(task, { done: task.bucket !== 'done' }),
    renderRowMenu,
    problemNotice: problem ? (
      <Alert
        tone="error"
        className="mb-4"
        action={
          <Button variant="link" onClick={() => setProblem(null)}>
            {t('contacts.dismiss')}
          </Button>
        }
      >
        {problem}
      </Alert>
    ) : null,
    dialogs: (
      <ConfirmDialog
        isOpen={taskToDelete !== null}
        tone="danger"
        title={formatMessage('tasks.delete.title', { title: taskToDelete?.title ?? '' })}
        description={t('tasks.delete.description')}
        confirmLabel={t('tasks.delete.confirm')}
        cancelLabel={t('tasks.form.cancel')}
        closeLabel={t('tasks.delete.close')}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setTaskToDelete(null)}
      />
    ),
  };
}
