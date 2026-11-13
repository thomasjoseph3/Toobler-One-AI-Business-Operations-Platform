import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { LeadsListResponse, Pipeline } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LeadsIcon, LoadingState, Pagination } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from './lead-display';
import { CreateLeadPanel } from './CreateLeadPanel';
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
  const [createdLeadName, setCreatedLeadName] = useState<string | null>(null);
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
    setCreatedLeadName(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  // After a lead is created: close the panel, say so, and load the list again so the new lead shows
  const handleLeadCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    setCreatedLeadName(displayName);
    leadsResource.reload();
  };
  const toolbar = (
    <>
      {createdLeadName !== null ? (
        <Alert
          tone="success"
          className="mb-4"
          action={
            <Button variant="link" onClick={() => setCreatedLeadName(null)}>
              {t('leadForm.dismiss')}
            </Button>
          }
        >
          {formatMessage('leadForm.created', { name: createdLeadName })}
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
    </>
  );

  if (leadsResource.state.status === 'loading' || pipelineResource.state.status === 'loading') {
    return (
      <>
        {toolbar}
        <Card>
          <LoadingState label={t('leads.loading')} rows={6} />
        </Card>
      </>
    );
  }

  if (leadsResource.state.status === 'error' || pipelineResource.state.status === 'error') {
    return (
      <>
        {toolbar}
        <Card>
          <ErrorState
            title={t('leads.loadError.title')}
            description={t('leads.loadError.description')}
            action={<Button onClick={reloadAll}>{t('session.retry')}</Button>}
          />
        </Card>
      </>
    );
  }

  const leads = leadsResource.state.data;
  const openStageIdsInOrder = pipelineResource.state.data.stages
    .filter((stage) => stage.kind === 'open')
    .map((stage) => stage.id);

  if (leads.total === 0) {
    const hasFilters = countActiveFilters(view) > 0;
    return (
      <>
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
      </>
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
    <>
      {toolbar}
      <div className="md:hidden">
        <LeadCards
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:block">
        <LeadsTable
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          selectedLeadIds={selectedLeadIds}
          onToggleLead={toggleLead}
          onToggleAllLeads={toggleAllLeads}
        />
        {footer}
      </Card>
    </>
  );
}
