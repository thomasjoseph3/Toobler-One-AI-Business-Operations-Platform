import { useState, type FormEvent } from 'react';
import type { SavedView } from '@toobler-one/shared';
import { Alert, Button, Dialog, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import type { LeadsView } from './leads-view';
import { leadsViewToRequest, MAX_VIEW_NAME_LENGTH } from './saved-views';

/** One plain sentence for a refused or failed save. Never a code or a status number. */
function describeSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

export interface SaveViewDialogProps {
  /** The list as it is on screen: this is what gets saved. */
  view: LeadsView;
  onClose: () => void;
  /** Called after the view was saved, with the saved view. */
  onSaved: (saved: SavedView) => void;
}

/**
 * The small box for saving the list as a named view (`POST /views`). It checks the name on the device first (not empty, 60 letters at most) and says in
 * words what went wrong (a name already used, too many views). Show it only while it is open.
 */
export function SaveViewDialog({ view, onClose, onSaved }: SaveViewDialogProps) {
  const [typedName, setTypedName] = useState('');
  const [nameProblem, setNameProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const formId = 'save-view-form';

  // Checks the name, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const name = typedName.trim();
    if (name === '') {
      setNameProblem(t('views.name.required'));
      return;
    }
    setNameProblem(undefined);
    setIsSaving(true);
    try {
      const saved = await apiRequest<SavedView>('POST', '/views', leadsViewToRequest(view, name));
      onSaved(saved);
    } catch (error) {
      setFormProblem(describeSaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('views.save.title')}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" isLoading={isSaving}>
            {t('views.save.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('views.name.label')}
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          maxLength={MAX_VIEW_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          helperText={t('views.save.hint')}
          {...(nameProblem ? { errorMessage: nameProblem } : {})}
        />
      </form>
    </Dialog>
  );
}
