import { useState, type FormEvent } from 'react';
import type { PipelineStage } from '@toobler-one/shared';
import { Alert, Button, Dialog, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { checkStageName, MAX_STAGE_NAME_LENGTH } from './stage-name';

/** One plain sentence for a refused or failed change to a column. Never a code or a status number. */
function describeStageProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 404) return t('pipeline.error.gone');
    if (error.code === 'STAGE_EXISTS') return t('pipeline.error.exists');
    if (error.code === 'TOO_MANY_STAGES') return t('pipeline.error.limit');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

export interface StageNameDialogProps {
  /** The column being renamed, or null to add a new column. */
  stageToRename: PipelineStage | null;
  onClose: () => void;
  /** Called after the change was saved, with the name now on the column. */
  onSaved: (stageName: string) => void;
}

/**
 * The small box for naming a column: "Add a column" (`POST /pipeline/stages`) or "Rename column" (`PATCH /pipeline/stages/{id}`).
 * It checks the name on the device first (not empty, 60 letters at most) and says in words what went wrong (a name already
 * taken, too many columns). Show it only while it is open.
 */
export function StageNameDialog({ stageToRename, onClose, onSaved }: StageNameDialogProps) {
  const [typedName, setTypedName] = useState(stageToRename?.name ?? '');
  const [nameProblem, setNameProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const isRenaming = stageToRename !== null;
  const formId = 'stage-name-form';

  // Checks the name, sends it, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const name = typedName.trim();
    const problemKey = checkStageName(name);
    if (problemKey !== null) {
      setNameProblem(t(problemKey));
      return;
    }
    setNameProblem(undefined);
    if (isRenaming && name === stageToRename.name) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      if (isRenaming) await apiRequest('PATCH', `/pipeline/stages/${stageToRename.id}`, { name });
      else await apiRequest('POST', '/pipeline/stages', { name });
      onSaved(name);
    } catch (error) {
      setFormProblem(describeStageProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={isRenaming ? t('pipeline.rename.title') : t('pipeline.add.title')}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" isLoading={isSaving}>
            {isRenaming ? t('pipeline.rename.submit') : t('pipeline.add.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('pipeline.name.label')}
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          maxLength={MAX_STAGE_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          helperText={isRenaming ? t('pipeline.rename.hint') : t('pipeline.add.hint')}
          {...(nameProblem ? { errorMessage: nameProblem } : {})}
        />
      </form>
    </Dialog>
  );
}
