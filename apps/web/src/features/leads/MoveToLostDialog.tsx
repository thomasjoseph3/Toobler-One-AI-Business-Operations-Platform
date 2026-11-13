import { useState } from 'react';
import type { LostReasonsResponse } from '@toobler-one/shared';
import { Button, Dialog, LoadingState, SelectField } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';

export interface MoveToLostDialogProps {
  /** The name shown for the lead ("Priya Menon"). */
  displayName: string;
  /** True while the move is being sent: the main button shows it is busy. */
  isSaving: boolean;
  /** Called with the chosen reason, exactly as the business wrote it. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * The question asked before a lead is moved to Lost: why? The reasons are the business's own list (`GET /lost-reasons`), because
 * the API only accepts one of them. The first is chosen to start with. Show this component only while the question is open: it
 * loads the reasons when it appears.
 */
export function MoveToLostDialog({ displayName, isSaving, onConfirm, onCancel }: MoveToLostDialogProps) {
  const { state, reload } = useApiResource<LostReasonsResponse>('/lost-reasons');
  const [pickedReason, setPickedReason] = useState('');
  const reasons = state.status === 'ready' ? state.data.items : [];
  const chosenReason = pickedReason !== '' ? pickedReason : (reasons[0]?.label ?? '');

  return (
    <Dialog
      isOpen
      onClose={onCancel}
      title={formatMessage('leads.lost.title', { name: displayName })}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onCancel}>{t('leadForm.cancel')}</Button>
          <Button
            variant="primary"
            isLoading={isSaving}
            disabled={chosenReason === ''}
            onClick={() => onConfirm(chosenReason)}
          >
            {t('leads.lost.confirm')}
          </Button>
        </>
      }
    >
      {state.status === 'loading' ? <LoadingState label={t('leads.lost.loading')} rows={1} /> : null}
      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-body-md text-error">{t('leads.lost.loadError')}</p>
          <Button size="compact" onClick={reload}>
            {t('session.retry')}
          </Button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <SelectField
          label={t('leads.lost.reason')}
          value={chosenReason}
          options={reasons.map((reason) => ({ value: reason.label, label: reason.label }))}
          onChange={(event) => setPickedReason(event.target.value)}
        />
      ) : null}
    </Dialog>
  );
}
