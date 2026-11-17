import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import type { ContactsListResponse } from '@toobler-one/shared';
import { Alert, Button, Card, ContactsIcon, EmptyState, ErrorState, LoadingState, Pagination, PlusIcon, SelectField, TextField } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { describeShownRange } from '../leads/lead-display';
import { ContactsList } from './ContactsList';
import { CreateContactPanel } from './CreateContactPanel';
import {
  buildContactsPath,
  DEFAULT_CONTACTS_VIEW,
  isContactsViewFiltered,
  LIFECYCLE_CHOICES,
  readContactsView,
  writeContactsView,
  type ContactsView,
} from './contacts-view';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;

/** Reads the message another page left behind in the navigation (for example "Priya was deleted."), or nothing. */
function readNoticeTextFromState(state: unknown): string | null {
  const notice = (state as { notice?: { text?: unknown } } | null)?.notice;
  return typeof notice?.text === 'string' ? notice.text : null;
}

/**
 * The Contacts page: a search box, a stage filter and Add contact, then the people as a table (tablet and desktop) or cards
 * (phone), 25 to a page. What is shown (search, stage, page) lives in the web address, so a refresh or the Back button keeps
 * it. It has loading, error (with retry), empty ("no contacts yet") and "nothing matches" states.
 */
export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readContactsView(searchParams);
  const contactsResource = useApiResource<ContactsListResponse>(buildContactsPath(view));
  const [typedSearch, setTypedSearch] = useState(view.searchText);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  // A counter so each opening of the panel starts with an empty form
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  // A confirmation the contact page left behind ("Priya was deleted.") shows first
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(readNoticeTextFromState(location.state));

  // Changes part of the view. Anything but the page starts again at page 1.
  const changeView = (changes: Partial<ContactsView>) => setSearchParams(writeContactsView({ ...view, page: 1, ...changes }));

  // Applies the typed search a moment after the typing stops
  useEffect(() => {
    if (typedSearch.trim() === view.searchText.trim()) return;
    const timer = setTimeout(() => setSearchParams(writeContactsView({ ...view, page: 1, searchText: typedSearch })), SEARCH_DELAY_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [typedSearch, view, setSearchParams]);

  const clearFilters = () => {
    setTypedSearch('');
    setSearchParams(writeContactsView(DEFAULT_CONTACTS_VIEW));
  };
  const openCreatePanel = () => {
    setNotice(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  const handleContactCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    setNotice(formatMessage('contacts.created', { name: displayName }));
    contactsResource.reload();
  };

  const toolbar = (
    <>
      {notice !== null ? (
        <Alert tone="success" className="mb-4" action={<Button variant="link" onClick={() => setNotice(null)}>{t('contacts.dismiss')}</Button>}>
          {notice}
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="md:w-72">
          <TextField label={t('contacts.search')} type="search" value={typedSearch} onChange={(event) => setTypedSearch(event.target.value)} autoComplete="off" />
        </div>
        <div className="md:w-52">
          <SelectField
            label={t('contacts.filter.stage')}
            value={view.lifecycleStage}
            onChange={(event) => changeView({ lifecycleStage: readContactsView(new URLSearchParams({ stage: event.target.value })).lifecycleStage })}
            options={[{ value: 'all', label: t('contacts.filter.allStages') }, ...LIFECYCLE_CHOICES.map((choice) => ({ value: choice.stage, label: t(choice.labelKey) }))]}
          />
        </div>
        <div className="md:ml-auto">
          <Button variant="primary" leadingIcon={<PlusIcon size={16} />} onClick={openCreatePanel}>
            {t('contacts.add')}
          </Button>
        </div>
      </div>
      <CreateContactPanel key={createPanelOpenCount} isOpen={isCreatePanelOpen} onClose={() => setIsCreatePanelOpen(false)} onCreated={handleContactCreated} />
    </>
  );

  const state = contactsResource.state;
  let body;
  if (state.status === 'loading') {
    body = <LoadingState label={t('contacts.loading')} rows={6} />;
  } else if (state.status === 'error') {
    body = (
      <ErrorState
        title={t('contacts.loadError.title')}
        description={t('contacts.loadError.description')}
        action={<Button onClick={contactsResource.reload}>{t('session.retry')}</Button>}
      />
    );
  } else if (state.data.total === 0) {
    body = isContactsViewFiltered(view) ? (
      <EmptyState
        icon={<ContactsIcon size={32} />}
        title={t('contacts.noMatch.title')}
        description={t('contacts.noMatch.description')}
        action={<Button onClick={clearFilters}>{t('contacts.clearFilters')}</Button>}
      />
    ) : (
      <EmptyState
        icon={<ContactsIcon size={32} />}
        title={t('page.contacts.emptyTitle')}
        description={t('page.contacts.emptyDescription')}
        action={<Button variant="primary" onClick={openCreatePanel}>{t('contacts.add')}</Button>}
      />
    );
  } else {
    const { items, total, page, limit } = state.data;
    body = (
      <>
        <ContactsList contacts={items} />
        <Pagination
          summary={formatMessage('contacts.showing', { shown: describeShownRange(page, limit, total), total })}
          previousLabel={t('leads.previous')}
          nextLabel={t('leads.next')}
          ariaLabel={t('contacts.pagination')}
          hasPrevious={page > 1}
          hasNext={page * limit < total}
          onPrevious={() => setSearchParams(writeContactsView({ ...view, page: page - 1 }))}
          onNext={() => setSearchParams(writeContactsView({ ...view, page: page + 1 }))}
        />
      </>
    );
  }
  return (
    <div>
      {toolbar}
      <Card isFlush>{body}</Card>
    </div>
  );
}
