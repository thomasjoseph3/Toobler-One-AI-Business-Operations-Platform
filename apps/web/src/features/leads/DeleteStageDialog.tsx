import { useState } from 'react';
import type { PipelineStage } from '@toobler-one/shared';
import { Alert, Button, Dialog, SelectField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';

/** One plain sentence for a refused or failed delete of a column. Never a code or a status number. */
function describeDeleteProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 404) return t('pipeline.error.gone');
    if (error.code === 'LAST_OPEN_STAGE') return t('pipeline.delete.lastOne');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

export interface DeleteStageDialogProps {
  stage: PipelineStage;
  /** The open stages the column's leads can go to (every open stage except this one). */
  otherOpenStages: readonly PipelineStage[];
  onClose: () => void;
  /** Called after the column was deleted. */
  onDeleted: (stageName: string) => void;
}

/**
 * The "Are you sure?" for deleting a column (`DELETE /pipeline/stages/{id}`). It names the column. A column with leads asks where
 * they go (any other open column, the first one to start with); an empty one just confirms. Show it only while it is open.
 */
export function DeleteStageDialog({ stage, otherOpenStages, onClose, onDeleted }: DeleteStageDialogProps) {
  const [moveToStageId, setMoveToStageId] = useState(otherOpenStages[0]?.id ?? '');
  const [problem, setProblem] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const hasLeads = stage.leadCount > 0;

  // Deletes the column (sending where its leads go, if it has any) and says what went wrong in plain words.
  async function confirmDelete() {
    setProblem(undefined);
    setIsDeleting(true);
    try {
      const query = hasLeads ? `?move_to=${encodeURIComponent(moveToStageId)}` : '';
      await apiRequest('DELETE', `/pipeline/stages/${stage.id}${query}`);
      onDeleted(stage.name);
    } catch (error) {
      setProblem(describeDeleteProblem(error));
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={formatMessage('pipeline.delete.title', { name: stage.name })}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button variant="destructive" isLoading={isDeleting} disabled={hasLeads && moveToStageId === ''} onClick={() => void confirmDelete()}>
            {t('pipeline.delete.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        <p className="text-body-md text-text-secondary">
          {hasLeads ? formatMessage('pipeline.delete.hasLeads', { count: stage.leadCount }) : t('pipeline.delete.empty')}
        </p>
        {hasLeads ? (
          <SelectField
            label={t('pipeline.delete.moveTo')}
            value={moveToStageId}
            onChange={(event) => setMoveToStageId(event.target.value)}
            options={otherOpenStages.map((other) => ({ value: other.id, label: other.name }))}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
