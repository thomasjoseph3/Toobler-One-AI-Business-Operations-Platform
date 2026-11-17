import { useState, type ReactNode } from 'react';
import type { Lead, PipelineStage, TasksListResponse } from '@toobler-one/shared';
import { ConfirmDialog } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { ChangeStatusMenu } from './ChangeStatusMenu';
import { LeadRowMenu } from './LeadRowMenu';
import { MoveToLostDialog } from './MoveToLostDialog';

/** A message to show after something was done, or after the API refused it. */
export interface LeadNotice {
  tone: 'success' | 'error';
  text: string;
}

/** Reads the message another page left behind in the navigation (for example "The lead for Priya was deleted."), or nothing. */
export function readNoticeFromState(state: unknown): LeadNotice | null {
  const notice = (state as { notice?: LeadNotice } | null)?.notice;
  const isNotice = notice && typeof notice.text === 'string' && (notice.tone === 'success' || notice.tone === 'error');
  return isNotice ? notice : null;
}

export interface LeadActionsOptions {
  /** Every stage of the pipeline: a lead can be moved to any of them. */
  stages: readonly PipelineStage[];
  signedInUser: { id: string; role: string };
  /** Called after an action worked, or when a lead turned out to be gone, so the screen loads its data again. */
  onChanged: () => void;
  /** Called after a lead was deleted, with the confirmation words (the lead page uses it to go back to the list). Without it, `onChanged` is called. */
  onDeleted?: (confirmation: string) => void;
  /** A message to show from the start, for example the one the previous page left behind. */
  initialNotice?: LeadNotice | null;
  /**
   * Lets a screen show a move at once, before the server answers (the Pipeline board). It is called with the lead and the new stage, and
   * gives back a function that puts the card back. When it is given, a move that worked does not load the data again (the screen
   * already shows it) and a move that failed calls the "put it back" function.
   */
  applyMoveLocally?: (lead: Lead, stage: PipelineStage) => () => void;
}

/**
 * Everything you can do to a lead from a menu: move it to a stage (Lost asks why first), take it or free it, and (managers)
 * delete it after an "Are you sure?". Shared by the list, the pipeline board and the lead page, so they all behave and
 * speak the same. It gives back the message to show (`notice`), the "…" menu for one lead (`renderRowMenu`), and the two
 * questions that can be open (`dialogs`, drawn once by the screen).
 */
export function useLeadActions({
  stages,
  signedInUser,
  onChanged,
  onDeleted,
  initialNotice = null,
  applyMoveLocally,
}: LeadActionsOptions) {
  // The message after an action, and the two questions that can be open: why lost, and are you sure
  const [notice, setNotice] = useState<LeadNotice | null>(initialNotice);
  const [pendingLostMove, setPendingLostMove] = useState<{
    lead: Lead;
    displayName: string;
    stage: PipelineStage;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ lead: Lead; displayName: string } | null>(null);
  // The question after a lead was won or lost and still has open tasks: close them too?
  const [pendingTaskClose, setPendingTaskClose] = useState<{ displayName: string; taskIds: string[] } | null>(null);
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
  const performLeadAction = async (
    action: () => Promise<unknown>,
    successText: string,
    shouldLoadAgain = true,
  ): Promise<boolean> => {
    setIsActing(true);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'success', text: successText });
      if (shouldLoadAgain) onChanged();
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: describeActionError(error) });
      return false;
    } finally {
      setIsActing(false);
    }
  };

  // Moves a lead. The screen may show the move at once; if the server then says no, the card is put back and the reason is shown.
  const performMove = async (lead: Lead, displayName: string, stage: PipelineStage, lostReason?: string) => {
    const putBack = applyMoveLocally?.(lead, stage);
    const body = lostReason === undefined ? { stageId: stage.id } : { stageId: stage.id, lostReason };
    const worked = await performLeadAction(
      () => apiRequest('POST', `/leads/${lead.id}/move`, body),
      formatMessage('leads.notice.moved', { name: displayName, stage: stage.name }),
      // A screen that already shows the move does not need to load everything again
      putBack === undefined,
    );
    if (!worked) {
      putBack?.();
      return;
    }
    if (stage.kind === 'won' || stage.kind === 'lost') await askAboutOpenTasks(lead, displayName);
  };

  // After a lead is won or lost: if it still has open tasks, asks whether to mark them done. Never blocks the move: if the tasks cannot be read, nothing is asked.
  const askAboutOpenTasks = async (lead: Lead, displayName: string) => {
    try {
      const openTasks = await apiRequest<TasksListResponse>('GET', `/tasks?lead_id=${lead.id}&limit=100`);
      if (openTasks.items.length > 0) {
        setPendingTaskClose({ displayName, taskIds: openTasks.items.map((task) => task.id) });
      }
    } catch {
      // The lead was moved; the tasks stay open and can be closed from the lead's page
    }
  };

  // Marks the open tasks done after the person said yes
  const confirmTaskClose = async () => {
    if (pendingTaskClose === null) return;
    const { displayName, taskIds } = pendingTaskClose;
    setIsActing(true);
    try {
      await Promise.all(taskIds.map((taskId) => apiRequest('PATCH', `/tasks/${taskId}`, { done: true })));
      setNotice({
        tone: 'success',
        text: formatMessage(taskIds.length === 1 ? 'tasks.closeOpen.done.one' : 'tasks.closeOpen.done.many', {
          name: displayName,
          count: taskIds.length,
        }),
      });
    } catch {
      setNotice({ tone: 'error', text: t('tasks.closeOpen.failed') });
    }
    setIsActing(false);
    setPendingTaskClose(null);
  };
  const moveToStage = (lead: Lead, displayName: string, stage: PipelineStage) => {
    // A lead can only be lost with a reason, so that asks first; every other move goes straight through
    if (stage.kind === 'lost') {
      setPendingLostMove({ lead, displayName, stage });
      return;
    }
    void performMove(lead, displayName, stage);
  };
  const confirmLostMove = async (reason: string) => {
    if (pendingLostMove === null) return;
    const { lead, displayName, stage } = pendingLostMove;
    // The question closes at once, and the card moves while the server is asked
    setPendingLostMove(null);
    await performMove(lead, displayName, stage, reason);
  };
  const assignOwner = (lead: Lead, displayName: string, ownerUserId: string | null) =>
    void performLeadAction(
      () => apiRequest('POST', `/leads/${lead.id}/assign`, { ownerUserId }),
      formatMessage(ownerUserId === null ? 'leads.notice.unassigned' : 'leads.notice.assigned', { name: displayName }),
    );
  const confirmDelete = async () => {
    if (pendingDelete === null) return;
    const { lead, displayName } = pendingDelete;
    const confirmation = formatMessage('leads.notice.deleted', { name: displayName });
    // A deleted lead cannot be loaded again, so a screen that handles the deletion itself is told instead
    const worked = await performLeadAction(() => apiRequest('DELETE', `/leads/${lead.id}`), confirmation, !onDeleted);
    setPendingDelete(null);
    if (worked) onDeleted?.(confirmation);
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

  /** The "Change status" button for a lead's page (shown on a phone): pick the new status from a list. */
  const renderChangeStatusMenu = (lead: Lead, displayName: string): ReactNode => (
    <ChangeStatusMenu
      lead={lead}
      displayName={displayName}
      stages={stages}
      onMoveToStage={(stage) => moveToStage(lead, displayName, stage)}
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
        isOpen={pendingTaskClose !== null}
        title={formatMessage('tasks.closeOpen.title', { name: pendingTaskClose?.displayName ?? '' })}
        description={
          pendingTaskClose?.taskIds.length === 1
            ? t('tasks.closeOpen.description.one')
            : formatMessage('tasks.closeOpen.description.many', { count: pendingTaskClose?.taskIds.length ?? 0 })
        }
        confirmLabel={t('tasks.closeOpen.confirm')}
        cancelLabel={t('tasks.closeOpen.cancel')}
        closeLabel={t('tasks.closeOpen.close')}
        isConfirming={isActing}
        onConfirm={() => void confirmTaskClose()}
        onCancel={() => setPendingTaskClose(null)}
      />
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

  return {
    notice,
    showNotice: setNotice,
    dismissNotice: () => setNotice(null),
    renderRowMenu,
    renderChangeStatusMenu,
    /** Moves a lead to a stage (Lost asks why first). The board calls it when a card is dropped on a column. */
    moveLeadToStage: moveToStage,
    dialogs,
  };
}
