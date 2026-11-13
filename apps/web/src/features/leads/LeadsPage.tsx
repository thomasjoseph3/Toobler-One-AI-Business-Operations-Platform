import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Lead, LeadsListResponse, Pipeline, PipelineStage } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LeadsIcon,
  LoadingState,
  Pagination,
} from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from './lead-display';
import { CreateLeadPanel } from './CreateLeadPanel';
import { LeadRowMenu } from './LeadRowMenu';
import { LeadCards, LeadsTable } from './LeadsTable';
import { LeadsToolbar } from './LeadsToolbar';
import { MoveToLostDialog } from './MoveToLostDialog';
import {
  buildLeadsPath,
  countActiveFilters,
  DEFAULT_LEADS_VIEW,
  LEADS_PAGE_SIZE,
  readLeadsView,
  writeLeadsView,
  type LeadsView,
} from './leads-view';

/** The Leads page fills the main area from 768 px, so the toolbar stays on top, the table scrolls and the footer stays at the bottom. */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/**
 * The Leads page: the toolbar (Filter and Sort work), then the leads, 25 to a page, as a table (tablet and desktop) or
 * cards (phone). What is shown (status, stage, owner, sort, page) lives in the web address, so a refresh or the Back button
 * keeps it. The page's title is the top bar's heading. It has a loading state, an error state with a retry, an empty state
 * that points to the channels, and a "nothing matches" state that offers to clear the filters.
 */
export function LeadsPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLeadIds, setSelectedLeadIds] = useState<ReadonlySet<string>>(new Set());
  // The Create lead panel: open or shut, a counter so each opening starts with an empty form, and the confirmation after a lead is created
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  // The message under the toolbar after something was done (or failed), and the two questions that can be open: why lost, and are you sure
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<{
    lead: Lead;
    displayName: string;
    stage: PipelineStage;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ lead: Lead; displayName: string } | null>(null);
  const [isActing, setIsActing] = useState(false);
  const view = readLeadsView(searchParams);
  const signedInUserId = sessionState.status === 'signedIn' ? sessionState.profile.user.id : '';
  const leadsResource = useApiResource<LeadsListResponse>(buildLeadsPath(view, signedInUserId));
  const pipelineResource = useApiResource<Pipeline>('/pipeline');

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1, and the ticks are cleared: they belong to the leads that were on screen.
  const changeView = (changes: Partial<LeadsView>) => {
    setSelectedLeadIds(new Set());
    setSearchParams(writeLeadsView({ ...view, page: 1, ...changes }));
  };
  const clearFilters = () =>
    changeView({
      status: DEFAULT_LEADS_VIEW.status,
      stageId: DEFAULT_LEADS_VIEW.stageId,
      owner: DEFAULT_LEADS_VIEW.owner,
    });
  const reloadAll = () => {
    leadsResource.reload();
    pipelineResource.reload();
  };

  const stages = pipelineResource.state.status === 'ready' ? pipelineResource.state.data.stages : [];
  const openCreatePanel = () => {
    setNotice(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  // After a lead is created: close the panel, say so, and load the list again so the new lead shows
  const handleLeadCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    setNotice({ tone: 'success', text: formatMessage('leadForm.created', { name: displayName }) });
    leadsResource.reload();
  };

  // The words for a refusal. A lead that is gone (deleted by someone else) also reloads the list.
  const describeActionError = (error: unknown): string => {
    if (error instanceof ApiRequestError) {
      if (error.code === 'NETWORK_ERROR') return t('leads.error.network');
      if (error.status === 403) return t('leads.error.forbidden');
      if (error.status === 404) {
        leadsResource.reload();
        return t('leads.error.gone');
      }
      if (error.status === 409 || error.code === 'VALIDATION_ERROR') return error.message;
    }
    return t('leads.error.unknown');
  };
  // Does one action on a lead: shows it is busy, says in words what happened (or what went wrong), and loads the list again.
  const performLeadAction = async (action: () => Promise<unknown>, successText: string) => {
    setIsActing(true);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'success', text: successText });
      leadsResource.reload();
    } catch (error) {
      setNotice({ tone: 'error', text: describeActionError(error) });
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
    await performLeadAction(
      () => apiRequest('DELETE', `/leads/${lead.id}`),
      formatMessage('leads.notice.deleted', { name: displayName }),
    );
    setPendingDelete(null);
  };
  // The "…" menu of one lead, with what each choice does
  const renderRowMenu = (lead: Lead, displayName: string) => (
    <LeadRowMenu
      lead={lead}
      displayName={displayName}
      stages={stages}
      signedInUser={{ id: user.id, role: user.role }}
      onMoveToStage={(stage) => moveToStage(lead, displayName, stage)}
      onAssignToMe={() => assignOwner(lead, displayName, user.id)}
      onRemoveOwner={() => assignOwner(lead, displayName, null)}
      onDelete={() => setPendingDelete({ lead, displayName })}
    />
  );

  const toolbar = (
    <>
      {notice !== null ? (
        <Alert
          tone={notice.tone}
          className="mb-4"
          action={
            <Button variant="link" onClick={() => setNotice(null)}>
              {t('leadForm.dismiss')}
            </Button>
          }
        >
          {notice.text}
        </Alert>
      ) : null}
      <LeadsToolbar view={view} stages={stages} onChangeView={changeView} onCreateLead={openCreatePanel} />
      <CreateLeadPanel
        key={createPanelOpenCount}
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        timeZone={business.timeZone}
        onCreated={handleLeadCreated}
      />
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

  if (leadsResource.state.status === 'loading' || pipelineResource.state.status === 'loading') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('leads.loading')} rows={6} />
        </Card>
      </div>
    );
  }

  if (leadsResource.state.status === 'error' || pipelineResource.state.status === 'error') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState
            title={t('leads.loadError.title')}
            description={t('leads.loadError.description')}
            action={<Button onClick={reloadAll}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }

  const leads = leadsResource.state.data;
  const openStageIdsInOrder = pipelineResource.state.data.stages
    .filter((stage) => stage.kind === 'open')
    .map((stage) => stage.id);

  if (leads.total === 0) {
    const hasFilters = countActiveFilters(view) > 0;
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          {hasFilters ? (
            <EmptyState
              icon={<LeadsIcon size={24} />}
              title={t('leads.noMatch.title')}
              description={t('leads.noMatch.description')}
              action={<Button onClick={clearFilters}>{t('leads.filter.clear')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<LeadsIcon size={24} />}
              title={t('page.leads.emptyTitle')}
              description={t('page.leads.emptyDescription')}
              action={
                <Link
                  to="/channels"
                  className="text-body-md-semibold inline-flex h-10 items-center rounded-md bg-action px-4 text-action-text hover:bg-action-hover active:bg-action-pressed"
                >
                  {t('page.setUpChannels')}
                </Link>
              }
            />
          )}
        </Card>
      </div>
    );
  }

  const toggleLead = (leadId: string) => {
    const nextSelection = new Set(selectedLeadIds);
    if (nextSelection.has(leadId)) nextSelection.delete(leadId);
    else nextSelection.add(leadId);
    setSelectedLeadIds(nextSelection);
  };
  const toggleAllLeads = () => {
    const areAllSelected = leads.items.every((lead) => selectedLeadIds.has(lead.id));
    setSelectedLeadIds(areAllSelected ? new Set() : new Set(leads.items.map((lead) => lead.id)));
  };
  const lastPage = Math.max(1, Math.ceil(leads.total / LEADS_PAGE_SIZE));
  const summary = formatMessage(view.status === 'closed' ? 'leads.showingClosed' : 'leads.showing', {
    shown: describeShownRange(leads.page, leads.limit, leads.total),
    total: leads.total,
  });
  const footer = (
    <Pagination
      summary={summary}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('leads.pagination')}
      hasPrevious={view.page > 1}
      hasNext={view.page < lastPage}
      onPrevious={() => changeView({ page: view.page - 1 })}
      onNext={() => changeView({ page: view.page + 1 })}
    />
  );

  return (
    <div className={PAGE_FRAME_CLASSES}>
      {toolbar}
      <div className="md:hidden">
        <LeadCards
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          renderRowMenu={renderRowMenu}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <LeadsTable
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          selectedLeadIds={selectedLeadIds}
          onToggleLead={toggleLead}
          onToggleAllLeads={toggleAllLeads}
          renderRowMenu={renderRowMenu}
        />
        {footer}
      </Card>
    </div>
  );
}
