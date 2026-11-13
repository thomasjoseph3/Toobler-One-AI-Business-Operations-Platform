import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { LeadsResponse, Pipeline } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LeadsIcon, LoadingState, Pagination } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from './lead-display';
import { CreateLeadPanel } from './CreateLeadPanel';
import { LeadsBoard } from './LeadsBoard';
import { LeadCards, LeadsTable } from './LeadsTable';
import { LeadsToolbar } from './LeadsToolbar';
import {
  buildLeadsPath,
  countActiveFilters,
  DEFAULT_LEADS_VIEW,
  LEADS_PAGE_SIZE,
  readLeadsView,
  writeLeadsView,
  type LeadsView,
} from './leads-view';
import { useLeadActions } from './useLeadActions';

/** The Leads page fills the main area from 768 px, so the toolbar stays on top, the leads scroll and the footer stays at the bottom. */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/**
 * The Leads page: the toolbar (Filter, Sort, the List / Pipeline switch and Create lead), then the leads as a table (tablet and
 * desktop) or cards (phone), 25 to a page, or as a Pipeline board with a column per stage. What is shown (layout, status,
 * stage, owner, sort, page) lives in the web address, so a refresh or the Back button keeps it. The page's title is the top
 * bar's heading. It has a loading state, an error state with a retry, an empty state that points to the channels, and a
 * "nothing matches" state that offers to clear the filters.
 */
export function LeadsPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLeadIds, setSelectedLeadIds] = useState<ReadonlySet<string>>(new Set());
  // The Create lead panel: open or shut, and a counter so each opening starts with an empty form
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  const view = readLeadsView(searchParams);
  const signedInUser =
    sessionState.status === 'signedIn'
      ? { id: sessionState.profile.user.id, role: sessionState.profile.user.role }
      : { id: '', role: '' };
  const leadsResource = useApiResource<LeadsResponse>(buildLeadsPath(view, signedInUser.id));
  const pipelineResource = useApiResource<Pipeline>('/pipeline');
  const stages = pipelineResource.state.status === 'ready' ? pipelineResource.state.data.stages : [];
  // Moving, assigning and deleting a lead, shared with the board and the lead page
  const actions = useLeadActions({ stages, signedInUser, onChanged: leadsResource.reload });

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

  const openCreatePanel = () => {
    actions.dismissNotice();
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  // After a lead is created: close the panel, say so, and load the list again so the new lead shows
  const handleLeadCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    actions.showNotice({ tone: 'success', text: formatMessage('leadForm.created', { name: displayName }) });
    leadsResource.reload();
  };

  const toolbar = (
    <>
      {actions.notice !== null ? (
        <Alert
          tone={actions.notice.tone}
          className="mb-4"
          action={
            <Button variant="link" onClick={actions.dismissNotice}>
              {t('leadForm.dismiss')}
            </Button>
          }
        >
          {actions.notice.text}
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
      {actions.dialogs}
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

  const answer = leadsResource.state.data;
  const totalLeads =
    answer.view === 'list' ? answer.total : answer.columns.reduce((total, column) => total + column.leadCount, 0);

  if (totalLeads === 0) {
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

  // The Pipeline board: a column per stage
  if (answer.view === 'board') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <LeadsBoard
          columns={answer.columns}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          renderRowMenu={actions.renderRowMenu}
        />
      </div>
    );
  }

  // The List: a table (tablet, desktop) or cards (phone), with Previous and Next under it
  const leads = answer;
  const openStageIdsInOrder = stages.filter((stage) => stage.kind === 'open').map((stage) => stage.id);
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
          renderRowMenu={actions.renderRowMenu}
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
          renderRowMenu={actions.renderRowMenu}
        />
        {footer}
      </Card>
    </div>
  );
}
