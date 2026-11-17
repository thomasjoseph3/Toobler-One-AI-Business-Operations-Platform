import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { TicketsListResponse } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, Pagination, PlusIcon, SelectField, TicketsIcon } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from '../leads/lead-display';
import { CreateTicketPanel } from './CreateTicketPanel';
import { TicketsList } from './TicketsList';
import {
  buildTicketsPath,
  DEFAULT_TICKETS_VIEW,
  isTicketsViewFiltered,
  readTicketsView,
  TICKET_PRIORITY_CHOICES,
  TICKET_TYPE_CHOICES,
  writeTicketsView,
  type TicketsView,
} from './tickets-view';

/**
 * The Tickets page: filters (status, owner, type, priority) and Add ticket, then the tickets as a table (tablet and desktop) or
 * cards (phone), 25 to a page, newest first. What is shown lives in the web address, so a refresh or the Back button keeps it.
 * It starts on open tickets. It has loading, error (with retry), empty ("no tickets yet") and "nothing matches" states.
 */
export function TicketsPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readTicketsView(searchParams);
  const ticketsResource = useApiResource<TicketsListResponse>(buildTicketsPath(view));
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  // A counter so each opening of the panel starts with an empty form
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1.
  const changeView = (changes: Partial<TicketsView>) => setSearchParams(writeTicketsView({ ...view, page: 1, ...changes }));
  const clearFilters = () => setSearchParams(writeTicketsView({ ...DEFAULT_TICKETS_VIEW, status: 'all' }));
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

  const state = ticketsResource.state;
  let body;
  if (state.status === 'loading') {
    body = <LoadingState label={t('tickets.loading')} rows={6} />;
  } else if (state.status === 'error') {
    body = (
      <ErrorState title={t('tickets.loadError.title')} description={t('tickets.loadError.description')} action={<Button onClick={ticketsResource.reload}>{t('session.retry')}</Button>} />
    );
  } else if (state.data.total === 0) {
    body = isTicketsViewFiltered(view) ? (
      <EmptyState
        icon={<TicketsIcon size={32} />}
        title={t('tickets.noMatch.title')}
        description={t('tickets.noMatch.description')}
        action={<Button onClick={clearFilters}>{t('tickets.showAll')}</Button>}
      />
    ) : (
      <EmptyState
        icon={<TicketsIcon size={32} />}
        title={t('tickets.empty.title')}
        description={t('page.tickets.emptyDescription')}
        action={<Button variant="primary" onClick={openCreatePanel}>{t('tickets.add')}</Button>}
      />
    );
  } else {
    const { items, total, page, limit } = state.data;
    body = (
      <>
        <TicketsList tickets={items} signedInUserId={user.id} timeZone={business.timeZone} />
        <Pagination
          summary={formatMessage('tickets.showing', { shown: describeShownRange(page, limit, total), total })}
          previousLabel={t('leads.previous')}
          nextLabel={t('leads.next')}
          ariaLabel={t('tickets.pagination')}
          hasPrevious={page > 1}
          hasNext={page * limit < total}
          onPrevious={() => setSearchParams(writeTicketsView({ ...view, page: page - 1 }))}
          onNext={() => setSearchParams(writeTicketsView({ ...view, page: page + 1 }))}
        />
      </>
    );
  }

  return (
    <div>
      {notice !== null ? (
        <Alert tone="success" className="mb-4" action={<Button variant="link" onClick={() => setNotice(null)}>{t('contacts.dismiss')}</Button>}>
          {notice}
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SelectField
            label={t('tickets.filter.status')}
            value={view.status}
            onChange={(event) => changeView({ status: event.target.value === 'all' ? 'all' : event.target.value === 'done' ? 'done' : 'open' })}
            options={[
              { value: 'open', label: t('tickets.status.open') },
              { value: 'done', label: t('tickets.status.done') },
              { value: 'all', label: t('tickets.filter.all') },
            ]}
          />
          <SelectField
            label={t('tickets.filter.owner')}
            value={view.owner}
            onChange={(event) => changeView({ owner: event.target.value === 'me' || event.target.value === 'unassigned' ? event.target.value : 'all' })}
            options={[
              { value: 'all', label: t('tickets.filter.everyone') },
              { value: 'me', label: t('tickets.filter.mine') },
              { value: 'unassigned', label: t('tickets.filter.unassigned') },
            ]}
          />
          <SelectField
            label={t('tickets.filter.type')}
            value={view.type}
            onChange={(event) => changeView({ type: TICKET_TYPE_CHOICES.find((choice) => choice.type === event.target.value)?.type ?? 'all' })}
            options={[{ value: 'all', label: t('tickets.filter.all') }, ...TICKET_TYPE_CHOICES.map((choice) => ({ value: choice.type, label: t(choice.labelKey) }))]}
          />
          <SelectField
            label={t('tickets.filter.priority')}
            value={view.priority}
            onChange={(event) => changeView({ priority: TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === event.target.value)?.priority ?? 'all' })}
            options={[{ value: 'all', label: t('tickets.filter.all') }, ...TICKET_PRIORITY_CHOICES.map((choice) => ({ value: choice.priority, label: t(choice.labelKey) }))]}
          />
        </div>
        <div className="md:ml-auto">
          <Button variant="primary" leadingIcon={<PlusIcon size={16} />} onClick={openCreatePanel}>
            {t('tickets.add')}
          </Button>
        </div>
      </div>
      <CreateTicketPanel key={createPanelOpenCount} isOpen={isCreatePanelOpen} onClose={() => setIsCreatePanelOpen(false)} onCreated={handleTicketCreated} />
      <Card isFlush>{body}</Card>
    </div>
  );
}
