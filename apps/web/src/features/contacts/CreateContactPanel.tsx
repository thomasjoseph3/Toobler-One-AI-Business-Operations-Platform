import { useState, type FormEvent } from 'react';
import type { Contact } from '@toobler-one/shared';
import { Alert, Button, SidePanel } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { findLeadDisplayName } from '../leads/lead-display';
import { ContactFormBoxes } from './ContactFormBoxes';
import { describeContactSaveProblem } from './contact-problem';
import {
  buildCreateContactRequest,
  checkContactForm,
  EMPTY_CONTACT_FORM,
  type ContactFormFields,
  type ContactFormProblems,
} from './contact-form';

const FORM_ID = 'create-contact-form';

export interface CreateContactPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the contact was saved, with the name to show in the confirmation. */
  onCreated: (displayName: string) => void;
}

/**
 * The Add contact form in a side panel: name, phone and email (a phone or an email is needed). It checks on the device first,
 * then sends `POST /contacts`. Everything typed stays when something goes wrong.
 */
export function CreateContactPanel({ isOpen, onClose, onCreated }: CreateContactPanelProps) {
  const [fields, setFields] = useState<ContactFormFields>(EMPTY_CONTACT_FORM);
  const [problems, setProblems] = useState<ContactFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<ContactFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends it, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkContactForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      const contact = await apiRequest<Contact>('POST', '/contacts', buildCreateContactRequest(fields));
      onCreated(findLeadDisplayName(contact));
    } catch (error) {
      setFormProblem(describeContactSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('contacts.form.title')}
      closeLabel={t('contacts.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('contacts.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('contacts.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <ContactFormBoxes fields={fields} problems={problems} onChange={changeFields} />
      </form>
    </SidePanel>
  );
}
