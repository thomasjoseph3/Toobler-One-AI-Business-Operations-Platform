import { useState, type FormEvent } from 'react';
import type { TicketDetail } from '@toobler-one/shared';
import { Alert, Button, SelectField, SidePanel, TextAreaField, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { buildUpdateTicketRequest, checkTicketEditForm, MAX_DETAILS_LENGTH, MAX_TITLE_LENGTH, ticketToEditFields, type TicketEditFields, type TicketFormProblems } from './ticket-form';
import { describeTicketChangeProblem } from './ticket-problem';
import { TICKET_PRIORITY_CHOICES, TICKET_TYPE_CHOICES } from './tickets-view';

const FORM_ID = 'edit-ticket-form';

export interface EditTicketPanelProps {
  ticket: TicketDetail;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the change was saved. */
  onSaved: () => void;
}

/**
 * The Edit ticket form in a side panel: title, details, type and priority. It checks on the device first, then sends only what
 * changed (`PATCH /tickets/{id}`). Everything typed stays when something goes wrong.
 */
export function EditTicketPanel({ ticket, isOpen, onClose, onSaved }: EditTicketPanelProps) {
  const [fields, setFields] = useState<TicketEditFields>(ticketToEditFields(ticket));
  const [problems, setProblems] = useState<TicketFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<TicketEditFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends what changed, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkTicketEditForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    const request = buildUpdateTicketRequest(fields, ticket);
    if (Object.keys(request).length === 0) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/tickets/${ticket.id}`, request);
      onSaved();
    } catch (error) {
      setFormProblem(describeTicketChangeProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('ticketPage.edit.title')}
      closeLabel={t('ticketPage.edit.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('tickets.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('ticketPage.edit.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField label={t('tickets.form.titleLabel')} value={fields.title} onChange={(event) => changeFields({ title: event.target.value })} maxLength={MAX_TITLE_LENGTH} autoComplete="off" {...(problems.title ? { errorMessage: t(problems.title) } : {})} />
        <SelectField label={t('tickets.form.type')} value={fields.type} onChange={(event) => changeFields({ type: TICKET_TYPE_CHOICES.find((choice) => choice.type === event.target.value)?.type ?? fields.type })} options={TICKET_TYPE_CHOICES.map((choice) => ({ value: choice.type, label: t(choice.labelKey) }))} />
        <SelectField label={t('tickets.form.priority')} value={fields.priority} onChange={(event) => changeFields({ priority: TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === event.target.value)?.priority ?? fields.priority })} options={TICKET_PRIORITY_CHOICES.map((choice) => ({ value: choice.priority, label: t(choice.labelKey) }))} />
        <TextAreaField label={t('tickets.form.details')} requirementLabel={t('tickets.form.optional')} value={fields.details} onChange={(event) => changeFields({ details: event.target.value })} maxLength={MAX_DETAILS_LENGTH} {...(problems.details ? { errorMessage: t(problems.details) } : {})} />
      </form>
    </SidePanel>
  );
}
