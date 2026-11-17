import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { TicketsListResponse } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, Pagination, TicketsIcon } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from '../leads/lead-display';
import { CreateTicketPanel } from './CreateTicketPanel';
import { TicketCards, TicketsTable } from './TicketsList';
import { TicketsToolbar } from './TicketsToolbar';
import {
  buildTicketsPath,
  countActiveTicketFilters,
  DEFAULT_TICKETS_VIEW,
  readTicketsView,
  TICKETS_PAGE_SIZE,
  writeTicketsView,
  type TicketsView,
} from './tickets-view';

/** The Tickets page fills the main area from 768 px, so the toolbar stays on top, the tickets scroll and the footer stays at the bottom (as on Leads). */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/**
 * The Tickets page, laid out like the Leads page: the toolbar (Filter and Add ticket), then the tickets as a table (tablet and
 * desktop) or cards (phone), 25 to a page, newest first, with Previous and Next under it. What is shown lives in the web
 * address, so a refresh or the Back button keeps it. It starts on open tickets. It has loading, error (with retry), empty
 * ("no open tickets") and "nothing matches" states.
 */
export function TicketsPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readTicketsView(searchParams);
  const ticketsResource = useApiResource<TicketsListResponse>(buildTicketsPath(view));
  const [selectedTicketIds, setSelectedTicketIds] = useState<ReadonlySet<string>>(new Set());
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  // A counter so each opening of the panel starts with an empty form
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1, and the ticks are cleared: they belong to the tickets that were on screen.
  const changeView = (changes: Partial<TicketsView>) => {
    setSelectedTicketIds(new Set());
    setSearchParams(writeTicketsView({ ...view, page: 1, ...changes }));
  };
  // Clearing shows every ticket, open and closed
  const clearFilters = () => changeView({ ...DEFAULT_TICKETS_VIEW, status: 'all' });
  const openCreatePanel = () => {
    setNotice(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  const handleTicketCreated = (title: string) => {
    setIsCreatePanelOpen(false);
    setNotice(formatMessage('tickets.created', { title }));
    ticketsResource.reload();
  };

  const toolbar = (
    <>
      {notice !== null ? (
        <Alert tone="success" className="mb-4" action={<Button variant="link" onClick={() => setNotice(null)}>{t('contacts.dismiss')}</Button>}>
          {notice}
        </Alert>
      ) : null}
      <TicketsToolbar view={view} onChangeView={changeView} onClearFilters={clearFilters} onAddTicket={openCreatePanel} />
      <CreateTicketPanel key={createPanelOpenCount} isOpen={isCreatePanelOpen} onClose={() => setIsCreatePanelOpen(false)} onCreated={handleTicketCreated} />
    </>
  );

  const state = ticketsResource.state;
  if (state.status === 'loading') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('tickets.loading')} rows={6} />
        </Card>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState title={t('tickets.loadError.title')} description={t('tickets.loadError.description')} action={<Button onClick={ticketsResource.reload}>{t('session.retry')}</Button>} />
        </Card>
      </div>
    );
  }
  if (state.data.total === 0) {
    const hasFilters = countActiveTicketFilters(view) > 0;
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          {hasFilters ? (
            <EmptyState icon={<TicketsIcon size={24} />} title={t('tickets.noMatch.title')} description={t('tickets.noMatch.description')} action={<Button onClick={clearFilters}>{t('tickets.showAll')}</Button>} />
          ) : (
            <EmptyState icon={<TicketsIcon size={24} />} title={t('tickets.empty.title')} description={t('page.tickets.emptyDescription')} action={<Button variant="primary" onClick={openCreatePanel}>{t('tickets.add')}</Button>} />
          )}
        </Card>
      </div>
    );
  }

  // The list: a table (tablet, desktop) or cards (phone), with Previous and Next under it
  const { items, total, page, limit } = state.data;
  const toggleTicket = (ticketId: string) => {
    const nextSelection = new Set(selectedTicketIds);
    if (nextSelection.has(ticketId)) nextSelection.delete(ticketId);
    else nextSelection.add(ticketId);
    setSelectedTicketIds(nextSelection);
  };
  const toggleAllTickets = () => {
    const areAllSelected = items.every((ticket) => selectedTicketIds.has(ticket.id));
    setSelectedTicketIds(areAllSelected ? new Set() : new Set(items.map((ticket) => ticket.id)));
  };
  const lastPage = Math.max(1, Math.ceil(total / TICKETS_PAGE_SIZE));
  const footer = (
    <Pagination
      summary={formatMessage('tickets.showing', { shown: describeShownRange(page, limit, total), total })}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('tickets.pagination')}
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
        <TicketCards tickets={items} signedInUserId={user.id} />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <TicketsTable tickets={items} signedInUserId={user.id} timeZone={business.timeZone} selectedTicketIds={selectedTicketIds} onToggleTicket={toggleTicket} onToggleAllTickets={toggleAllTickets} />
        {footer}
      </Card>
    </div>
  );
}
