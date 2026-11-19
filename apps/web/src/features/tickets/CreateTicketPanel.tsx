import { useState, type FormEvent } from 'react';
import type { Contact, TicketDetail } from '@toobler-one/shared';
import { Alert, Button, SelectField, SidePanel, TextAreaField, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { ContactPicker } from './ContactPicker';
import {
  buildCreateTicketRequest,
  checkTicketForm,
  EMPTY_TICKET_FORM,
  MAX_DETAILS_LENGTH,
  MAX_TITLE_LENGTH,
  type TicketFormFields,
  type TicketFormProblems,
} from './ticket-form';
import { TICKET_PRIORITY_CHOICES, TICKET_TYPE_CHOICES } from './tickets-view';

const FORM_ID = 'create-ticket-form';

/** One plain sentence for a refused or failed save. Never a code or a status number. */
function describeTicketSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('tickets.form.error.network');
    if (error.status === 404) return t('tickets.form.error.personGone');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('tickets.form.error.unknown');
}

export interface CreateTicketPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the ticket was saved, with its title for the confirmation. */
  onCreated: (title: string) => void;
}

/**
 * The Add ticket form in a side panel: who it is about (searched), a title, what it is about (type and priority) and details.
 * It checks on the device first, then sends `POST /tickets`. The ticket starts open and unassigned. Everything typed stays when
 * something goes wrong.
 */
export function CreateTicketPanel({ isOpen, onClose, onCreated }: CreateTicketPanelProps) {
  const [fields, setFields] = useState<TicketFormFields>(EMPTY_TICKET_FORM);
  const [chosenPerson, setChosenPerson] = useState<Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null>(null);
  const [problems, setProblems] = useState<TicketFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<TicketFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends it, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkTicketForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0 || fields.contactId === null) return;
    setIsSaving(true);
    try {
      const ticket = await apiRequest<TicketDetail>(
        'POST',
        '/tickets',
        buildCreateTicketRequest(fields, fields.contactId),
      );
      onCreated(ticket.title);
    } catch (error) {
      setFormProblem(describeTicketSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('tickets.form.title')}
      closeLabel={t('tickets.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('tickets.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('tickets.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <ContactPicker
          chosenPerson={chosenPerson}
          onChoose={(person) => {
            setChosenPerson(person);
            changeFields({ contactId: person?.id ?? null });
          }}
          errorMessage={problems.contact ? t(problems.contact) : undefined}
        />
        <TextField
          label={t('tickets.form.titleLabel')}
          value={fields.title}
          onChange={(event) => changeFields({ title: event.target.value })}
          maxLength={MAX_TITLE_LENGTH}
          autoComplete="off"
          helperText={t('tickets.form.titleHint')}
          {...(problems.title ? { errorMessage: t(problems.title) } : {})}
        />
        <SelectField
          label={t('tickets.form.type')}
          value={fields.type}
          onChange={(event) =>
            changeFields({
              type: TICKET_TYPE_CHOICES.find((choice) => choice.type === event.target.value)?.type ?? 'other',
            })
          }
          options={TICKET_TYPE_CHOICES.map((choice) => ({ value: choice.type, label: t(choice.labelKey) }))}
        />
        <SelectField
          label={t('tickets.form.priority')}
          value={fields.priority}
          onChange={(event) =>
            changeFields({
              priority:
                TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === event.target.value)?.priority ?? 'normal',
            })
          }
          options={TICKET_PRIORITY_CHOICES.map((choice) => ({ value: choice.priority, label: t(choice.labelKey) }))}
        />
        <TextAreaField
          label={t('tickets.form.details')}
          requirementLabel={t('tickets.form.optional')}
          value={fields.details}
          onChange={(event) => changeFields({ details: event.target.value })}
          maxLength={MAX_DETAILS_LENGTH}
          {...(problems.details ? { errorMessage: t(problems.details) } : {})}
        />
        <p className="text-body-xs text-text-secondary">{t('tickets.form.ownerNote')}</p>
      </form>
    </SidePanel>
  );
}
