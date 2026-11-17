import { useState, type FormEvent } from 'react';
import type { Contact } from '@toobler-one/shared';
import { Alert, Button, Checkbox, SidePanel } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { ContactFormBoxes } from './ContactFormBoxes';
import {
  buildUpdateContactRequest,
  checkContactForm,
  contactToFormFields,
  type ContactFormFields,
  type ContactFormProblems,
} from './contact-form';
import { describeContactSaveProblem } from './contact-problem';

const FORM_ID = 'edit-contact-form';

export interface EditContactPanelProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the change was saved, with the contact as the API now has it. */
  onSaved: (contact: Contact) => void;
}

/**
 * The Edit contact form in a side panel: name, phone, email, language and the "Not a fit" tick. It checks on the device first,
 * then sends only what changed (`PATCH /contacts/{id}`). Everything typed stays when something goes wrong.
 */
export function EditContactPanel({ contact, isOpen, onClose, onSaved }: EditContactPanelProps) {
  const [fields, setFields] = useState<ContactFormFields>(contactToFormFields(contact));
  const [isNotAFit, setIsNotAFit] = useState(contact.lifecycleStage === 'not_a_fit');
  const [problems, setProblems] = useState<ContactFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<ContactFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends what changed, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkContactForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    const request = buildUpdateContactRequest(fields, contact, isNotAFit);
    if (Object.keys(request).length === 0) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      onSaved(await apiRequest<Contact>('PATCH', `/contacts/${contact.id}`, request));
    } catch (error) {
      setFormProblem(describeContactSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('contactPage.edit.title')}
      closeLabel={t('contactPage.edit.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('contacts.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('contactPage.edit.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <ContactFormBoxes fields={fields} problems={problems} onChange={changeFields} showLanguage />
        <div>
          <Checkbox label={t('contactPage.edit.notAFit')} checked={isNotAFit} onChange={() => setIsNotAFit((current) => !current)} />
          <p className="text-body-xs mt-1 text-text-secondary">{t('contactPage.edit.notAFitHint')}</p>
        </div>
      </form>
    </SidePanel>
  );
}
