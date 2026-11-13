import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, EmptyState, ErrorState, LeadsIcon, LoadingState, Pagination } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from './lead-display';
import { LeadCards, LeadsTable } from './LeadsTable';
import { LeadsToolbar } from './LeadsToolbar';
import { LEADS_PAGE_SIZE, useLeadsList } from './useLeadsList';

/** The Leads page: the toolbar, then the leads below it (see LeadsBody). */
export function LeadsPage() {
  return (
    <>
      <LeadsToolbar />
      <LeadsBody />
    </>
  );
}

/**
 * The leads under the toolbar: the open leads, 25 to a page, as a table (tablet and desktop) or cards (phone). The page's title is the
 * top bar's heading. It has a loading state, an error state with a retry, and an empty state that points to the channels.
 */
function LeadsBody() {
  const { sessionState } = useSession();
  const [page, setPage] = useState(1);
  const [selectedLeadIds, setSelectedLeadIds] = useState<ReadonlySet<string>>(new Set());
  const { state, reload } = useLeadsList(page);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Moving to another page clears the ticks: they belong to the leads that were on screen
  const goToPage = (newPage: number) => {
    setSelectedLeadIds(new Set());
    setPage(newPage);
  };

  if (state.status === 'loading') {
    return (
      <Card>
        <LoadingState label={t('leads.loading')} rows={6} />
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <ErrorState
          title={t('leads.loadError.title')}
          description={t('leads.loadError.description')}
          action={<Button onClick={reload}>{t('session.retry')}</Button>}
        />
      </Card>
    );
  }

  const { leads, openStageIdsInOrder } = state.data;
  if (leads.total === 0) {
    return (
      <Card>
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
      </Card>
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
  const summary = formatMessage('leads.showing', {
    shown: describeShownRange(leads.page, leads.limit, leads.total),
    total: leads.total,
  });

  return (
    <>
      <div className="md:hidden">
        <LeadCards
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
          <PaginationFooter
            summary={summary}
            hasPrevious={page > 1}
            hasNext={page < lastPage}
            onPrevious={() => goToPage(page - 1)}
            onNext={() => goToPage(page + 1)}
          />
        </div>
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
        <PaginationFooter
          summary={summary}
          hasPrevious={page > 1}
          hasNext={page < lastPage}
          onPrevious={() => goToPage(page - 1)}
          onNext={() => goToPage(page + 1)}
        />
      </Card>
    </>
  );
}

/** The footer under the leads: what is shown, and Previous and Next. */
function PaginationFooter(props: {
  summary: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <Pagination
      summary={props.summary}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('leads.pagination')}
      hasPrevious={props.hasPrevious}
      hasNext={props.hasNext}
      onPrevious={props.onPrevious}
      onNext={props.onNext}
    />
  );
}
