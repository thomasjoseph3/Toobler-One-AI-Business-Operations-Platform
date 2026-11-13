import { useState, type ReactNode } from 'react';
import type { Lead, PipelineStage } from '@toobler-one/shared';
import { ConfirmDialog } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { LeadRowMenu } from './LeadRowMenu';
import { MoveToLostDialog } from './MoveToLostDialog';

/** A message to show after something was done, or after the API refused it. */
export interface LeadNotice {
  tone: 'success' | 'error';
  text: string;
}

export interface LeadActionsOptions {
  /** Every stage of the pipeline: a lead can be moved to any of them. */
  stages: readonly PipelineStage[];
  signedInUser: { id: string; role: string };
  /** Called after an action worked, or when a lead turned out to be gone, so the screen loads its data again. */
  onChanged: () => void;
  /** Called after a lead was deleted (the lead page uses it to go back to the list). */
  onDeleted?: () => void;
}

/**
 * Everything you can do to a lead from a menu: move it to a stage (Lost asks why first), take it or free it, and (managers)
 * delete it after an "Are you sure?". Shared by the list, the pipeline board and the lead page, so they all behave and
 * speak the same. It gives back the message to show (`notice`), the "…" menu for one lead (`renderRowMenu`), and the two
 * questions that can be open (`dialogs`, drawn once by the screen).
 */
export function useLeadActions({ stages, signedInUser, onChanged, onDeleted }: LeadActionsOptions) {
  // The message after an action, and the two questions that can be open: why lost, and are you sure
  const [notice, setNotice] = useState<LeadNotice | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<{
    lead: Lead;
    displayName: string;
    stage: PipelineStage;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ lead: Lead; displayName: string } | null>(null);
  const [isActing, setIsActing] = useState(false);

  // The words for a refusal. A lead that is gone (deleted by someone else) also loads the screen's data again.
  const describeActionError = (error: unknown): string => {
    if (error instanceof ApiRequestError) {
      if (error.code === 'NETWORK_ERROR') return t('leads.error.network');
      if (error.status === 403) return t('leads.error.forbidden');
      if (error.status === 404) {
        onChanged();
        return t('leads.error.gone');
      }
      if (error.status === 409 || error.code === 'VALIDATION_ERROR') return error.message;
    }
    return t('leads.error.unknown');
  };

  // Does one action on a lead: shows it is busy, says in words what happened (or what went wrong), and loads the data again.
  // Returns true when the action worked.
  const performLeadAction = async (action: () => Promise<unknown>, successText: string): Promise<boolean> => {
    setIsActing(true);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'success', text: successText });
      onChanged();
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: describeActionError(error) });
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const moveToStage = (lead: Lead, displayName: string, stage: PipelineStage) => {
    // A lead can only be lost with a reason, so that asks first; every other move goes straight through
    if (stage.kind === 'lost') {
      setPendingLostMove({ lead, displayName, stage });
      return;
    }
    void performLeadAction(
      () => apiRequest('POST', `/leads/${lead.id}/move`, { stageId: stage.id }),
      formatMessage('leads.notice.moved', { name: displayName, stage: stage.name }),
    );
  };
  const confirmLostMove = async (reason: string) => {
    if (pendingLostMove === null) return;
    const { lead, displayName, stage } = pendingLostMove;
    await performLeadAction(
      () => apiRequest('POST', `/leads/${lead.id}/move`, { stageId: stage.id, lostReason: reason }),
      formatMessage('leads.notice.moved', { name: displayName, stage: stage.name }),
    );
    setPendingLostMove(null);
  };
  const assignOwner = (lead: Lead, displayName: string, ownerUserId: string | null) =>
    void performLeadAction(
      () => apiRequest('POST', `/leads/${lead.id}/assign`, { ownerUserId }),
      formatMessage(ownerUserId === null ? 'leads.notice.unassigned' : 'leads.notice.assigned', { name: displayName }),
    );
  const confirmDelete = async () => {
    if (pendingDelete === null) return;
    const { lead, displayName } = pendingDelete;
    const worked = await performLeadAction(
      () => apiRequest('DELETE', `/leads/${lead.id}`),
      formatMessage('leads.notice.deleted', { name: displayName }),
    );
    setPendingDelete(null);
    if (worked) onDeleted?.();
  };

  /** The "…" menu of one lead, with what each choice does. `triggerText` draws it as a labelled button instead of the icon. */
  const renderRowMenu = (lead: Lead, displayName: string, triggerText?: string): ReactNode => (
    <LeadRowMenu
      lead={lead}
      displayName={displayName}
      stages={stages}
      signedInUser={signedInUser}
      {...(triggerText ? { triggerText } : {})}
      onMoveToStage={(stage) => moveToStage(lead, displayName, stage)}
      onAssignToMe={() => assignOwner(lead, displayName, signedInUser.id)}
      onRemoveOwner={() => assignOwner(lead, displayName, null)}
      onDelete={() => setPendingDelete({ lead, displayName })}
    />
  );

  const dialogs = (
    <>
      {pendingLostMove !== null ? (
        <MoveToLostDialog
          displayName={pendingLostMove.displayName}
          isSaving={isActing}
          onConfirm={(reason) => void confirmLostMove(reason)}
          onCancel={() => setPendingLostMove(null)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        tone="danger"
        title={formatMessage('leads.delete.title', { name: pendingDelete?.displayName ?? '' })}
        description={t('leads.delete.description')}
        confirmLabel={t('leads.delete.confirm')}
        cancelLabel={t('leadForm.cancel')}
        closeLabel={t('leadForm.close')}
        isConfirming={isActing}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );

  return { notice, showNotice: setNotice, dismissNotice: () => setNotice(null), renderRowMenu, dialogs };
}
