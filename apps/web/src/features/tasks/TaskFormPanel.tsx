import { useState, type FormEvent } from 'react';
import type { Contact, Task } from '@toobler-one/shared';
import { Alert, Button, SelectField, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { ContactPicker } from '../tickets/ContactPicker';
import {
  buildCreateTaskRequest,
  buildEmptyTaskForm,
  buildTaskFormFromTask,
  buildUpdateTaskRequest,
  checkTaskForm,
  type TaskFormFields,
  type TaskFormProblems,
} from './task-form';
import { TASK_KIND_CHOICES } from './tasks-view';
import { describeTaskChangeProblem, describeTaskSaveProblem } from './task-problem';

const FORM_ID = 'create-task-form';

export interface TaskFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The business's time zone: the due date and time are typed in it. */
  timeZone: string;
  /** When given, the form changes this task (`PATCH /tasks/{id}`) instead of adding one: kind, words, due date and time. */
  editingTask?: Task;
  /** When the task is for one lead (from a lead's row or page) the person is not asked for; the panel names the lead instead. */
  forLead?: { id: string; displayName: string };
  /** Called after the task was saved (added or changed), with its words for the confirmation. */
  onCreated: (title: string) => void;
}

/**
 * The Add task form in a side panel: who it is about (searched, unless the task is for a given lead), what kind it is, what needs doing and
 * when. It checks on the device first, then sends `POST /tasks`. The task is the signed-in person's own. Everything typed stays when
 * something goes wrong.
 */
export function TaskFormPanel({ isOpen, onClose, timeZone, editingTask, forLead, onCreated }: TaskFormPanelProps) {
  const [fields, setFields] = useState<TaskFormFields>(() =>
    editingTask ? buildTaskFormFromTask(editingTask, timeZone) : buildEmptyTaskForm(new Date(), timeZone),
  );
  const [chosenPerson, setChosenPerson] = useState<Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null>(null);
  const [problems, setProblems] = useState<TaskFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<TaskFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends it, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkTaskForm(fields, {
      needsContact: forLead === undefined && editingTask === undefined,
      timeZone,
    });
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      if (editingTask) {
        const changes = buildUpdateTaskRequest(fields, editingTask, timeZone);
        // Nothing changed: no need to ask the API
        if (Object.keys(changes).length > 0) await apiRequest<Task>('PATCH', `/tasks/${editingTask.id}`, changes);
      } else {
        const target = forLead !== undefined ? { leadId: forLead.id } : { contactId: fields.contactId ?? '' };
        await apiRequest<Task>('POST', '/tasks', buildCreateTaskRequest(fields, target, timeZone));
      }
      onCreated(fields.title.trim());
    } catch (error) {
      setFormProblem(editingTask ? describeTaskChangeProblem(error) : describeTaskSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingTask
          ? t('tasks.edit.title')
          : forLead
            ? formatMessage('tasks.form.titleFor', { name: forLead.displayName })
            : t('tasks.form.title')
      }
      closeLabel={t('tasks.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('tasks.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {editingTask ? t('tasks.edit.submit') : t('tasks.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        {forLead === undefined && editingTask === undefined ? (
          <ContactPicker
            chosenPerson={chosenPerson}
            onChoose={(person) => {
              setChosenPerson(person);
              changeFields({ contactId: person?.id ?? null });
            }}
            errorMessage={problems.contact ? t(problems.contact) : undefined}
          />
        ) : null}
        <SelectField
          label={t('tasks.form.kind')}
          value={fields.kind}
          onChange={(event) =>
            changeFields({
              kind: TASK_KIND_CHOICES.find((choice) => choice.kind === event.target.value)?.kind ?? 'todo',
            })
          }
          options={TASK_KIND_CHOICES.map((choice) => ({ value: choice.kind, label: t(choice.labelKey) }))}
        />
        <TextField
          label={t('tasks.form.titleLabel')}
          value={fields.title}
          onChange={(event) => changeFields({ title: event.target.value })}
          maxLength={200}
          autoComplete="off"
          helperText={t('tasks.form.titleHint')}
          {...(problems.title ? { errorMessage: t(problems.title) } : {})}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('tasks.form.dueDate')}
            type="date"
            value={fields.dueDate}
            onChange={(event) => changeFields({ dueDate: event.target.value })}
            {...(problems.due ? { errorMessage: t(problems.due) } : {})}
          />
          <TextField
            label={t('tasks.form.dueTime')}
            type="time"
            value={fields.dueTime}
            onChange={(event) => changeFields({ dueTime: event.target.value })}
          />
        </div>
        {editingTask ? null : <p className="text-body-xs text-text-secondary">{t('tasks.form.ownerNote')}</p>}
      </form>
    </SidePanel>
  );
}
