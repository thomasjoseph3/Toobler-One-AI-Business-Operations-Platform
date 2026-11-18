import { useState, type FormEvent } from 'react';
import type { ContactList } from '@toobler-one/shared';
import { Alert, Button, Dialog, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import type { ContactsView } from '../contacts/contacts-view';
import { MAX_CONTACT_LIST_NAME_LENGTH } from './list-name';
import { contactsViewToListRequest } from './lists-state';

/** One plain sentence for a refused or failed save. Never a code or a status number. */
function describeSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

export interface SaveListDialogProps {
  /** The contacts list as it is on screen: the people who match it right now go into the list. */
  view: ContactsView;
  onClose: () => void;
  /** Called after the list was made, with the list. */
  onSaved: (list: ContactList) => void;
}

/**
 * The small box for saving the contacts that match the list on screen as a named, fixed list (`POST /lists`). It checks the name on the device first and
 * says in words what went wrong (a name already used, a view that matches too many). Show it only while it is open.
 */
export function SaveListDialog({ view, onClose, onSaved }: SaveListDialogProps) {
  const [typedName, setTypedName] = useState('');
  const [nameProblem, setNameProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const formId = 'save-list-form';

  // Checks the name, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    if (typedName.trim() === '') {
      setNameProblem(t('lists.name.required'));
      return;
    }
    setNameProblem(undefined);
    setIsSaving(true);
    try {
      onSaved(await apiRequest<ContactList>('POST', '/lists', contactsViewToListRequest(view, typedName)));
    } catch (error) {
      setFormProblem(describeSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('lists.save.title')}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" isLoading={isSaving}>
            {t('lists.save.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('lists.name.label')}
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          maxLength={MAX_CONTACT_LIST_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          helperText={t('lists.save.hint')}
          {...(nameProblem ? { errorMessage: nameProblem } : {})}
        />
      </form>
    </Dialog>
  );
}
