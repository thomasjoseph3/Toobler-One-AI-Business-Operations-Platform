import { useState, type FormEvent } from 'react';
import type { SavedView } from '@toobler-one/shared';
import { Alert, Button, ConfirmDialog, Dialog, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { MAX_VIEW_NAME_LENGTH } from './saved-views';

/** One plain sentence for a refused or failed change to a view. Never a code or a status number. */
function describeViewProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('views.error.forbidden');
    if (error.status === 404) return t('views.error.gone');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

/** True when this person may change the view: it is theirs, or it is shared and they are a manager. */
export function maySeeViewActions(saved: SavedView, isManager: boolean): boolean {
  return saved.isMine || (saved.shared && isManager);
}

/** The box for renaming the view (`PATCH /views/{id}`). It checks the name on the device first and says in words what went wrong. */
function RenameViewDialog({
  saved,
  onClose,
  onRenamed,
}: {
  saved: SavedView;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [typedName, setTypedName] = useState(saved.name);
  const [nameProblem, setNameProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const formId = 'rename-view-form';

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
    if (name === saved.name) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/views/${saved.id}`, { name });
      onRenamed();
    } catch (error) {
      setFormProblem(describeViewProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('views.rename.title')}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" isLoading={isSaving}>
            {t('views.rename.submit')}
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
          {...(nameProblem ? { errorMessage: nameProblem } : {})}
        />
      </form>
    </Dialog>
  );
}

export interface ViewActionsProps {
  /** The saved view the list is showing. */
  saved: SavedView;
  /** True for a manager: only a manager shares a view with the team. */
  isManager: boolean;
  /** Called after the view was renamed, shared, unshared or deleted, with the sentence to tell the person. */
  onChanged: (message: string) => void;
  /** Called with a sentence when a change was refused or failed. */
  onProblem: (message: string) => void;
}

/**
 * What a person can do with the saved view the list is showing: Rename, Share with the team (managers) or Stop sharing, and Delete (after an
 * "Are you sure?" that names the view). Nothing shows for a view the person may not change.
 */
export function ViewActions({ saved, isManager, onChanged, onProblem }: ViewActionsProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Shares the view with the team or stops sharing it
  async function changeSharing() {
    setIsBusy(true);
    try {
      await apiRequest('PATCH', `/views/${saved.id}`, { shared: !saved.shared });
      onChanged(formatMessage(saved.shared ? 'views.unshared' : 'views.shared', { name: saved.name }));
    } catch (error) {
      onProblem(describeViewProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  // Deletes the view for good (after the person said yes)
  async function deleteView() {
    setIsBusy(true);
    try {
      await apiRequest('DELETE', `/views/${saved.id}`);
      setIsConfirmingDelete(false);
      onChanged(formatMessage('views.deleted', { name: saved.name }));
    } catch (error) {
      setIsConfirmingDelete(false);
      onProblem(describeViewProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-body-sm text-text-secondary">
        {formatMessage('views.actions.about', { name: saved.name })}
        {saved.shared ? ` · ${t('views.sharedWord')}` : ''}
      </span>
      <Button size="compact" disabled={isBusy} onClick={() => setIsRenaming(true)}>
        {t('views.rename.button')}
      </Button>
      {isManager ? (
        <Button size="compact" disabled={isBusy} onClick={() => void changeSharing()}>
          {saved.shared ? t('views.unshare.button') : t('views.share.button')}
        </Button>
      ) : null}
      <Button size="compact" disabled={isBusy} onClick={() => setIsConfirmingDelete(true)}>
        {t('views.delete.button')}
      </Button>
      {isRenaming ? (
        <RenameViewDialog
          saved={saved}
          onClose={() => setIsRenaming(false)}
          onRenamed={() => {
            setIsRenaming(false);
            onChanged(t('views.renamed'));
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title={formatMessage('views.delete.title', { name: saved.name })}
        description={t('views.delete.description')}
        confirmLabel={t('views.delete.confirm')}
        cancelLabel={t('leadForm.cancel')}
        closeLabel={t('leadForm.close')}
        tone="danger"
        isConfirming={isBusy}
        onConfirm={() => void deleteView()}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}
