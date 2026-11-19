import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { Contact, ContactsListResponse } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  ContactsIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from '../leads/lead-display';
import { ContactCards, ContactsTable } from './ContactsList';
import { ContactRowMenu } from './ContactRowMenu';
import { SaveListDialog } from '../lists/SaveListDialog';
import { describeListMade } from '../lists/lists-state';
import { ContactsToolbar } from './ContactsToolbar';
import { CreateContactPanel } from './CreateContactPanel';
import { describeContactSaveProblem } from './contact-problem';
import {
  CONTACTS_PAGE_SIZE,
  DEFAULT_CONTACTS_VIEW,
  buildContactsPath,
  countActiveContactFilters,
  readContactsView,
  writeContactsView,
  type ContactsView,
} from './contacts-view';

/** The Contacts page fills the main area from 768 px, so the toolbar stays on top, the contacts scroll and the footer stays at the bottom (as on Leads). */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;

/** Reads the message another page left behind in the navigation (for example "Priya was deleted."), or nothing. */
function readNoticeFromState(state: unknown): { tone: 'success' | 'error'; text: string } | null {
  const notice = (state as { notice?: { tone?: unknown; text?: unknown } } | null)?.notice;
  if (typeof notice?.text !== 'string') return null;
  return { tone: notice.tone === 'error' ? 'error' : 'success', text: notice.text };
}

/**
 * The Contacts page, laid out like the Leads page: the toolbar (search, Filter and Add contact), then the people as a table
 * (tablet and desktop) or cards (phone), 25 to a page, with Previous and Next under it. What is shown (search, stage, page) lives
 * in the web address, so a refresh or the Back button keeps it. It has loading, error (with retry), empty ("no contacts yet")
 * and "nothing matches" states. A "…" menu on each row opens the contact or (managers) deletes it after "Are you sure?".
 */
export function ContactsPage() {
  const { sessionState } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readContactsView(searchParams);
  const contactsResource = useApiResource<ContactsListResponse>(buildContactsPath(view));
  const [typedSearch, setTypedSearch] = useState(view.searchText);
  const [selectedContactIds, setSelectedContactIds] = useState<ReadonlySet<string>>(new Set());
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  // A counter so each opening of the panel starts with an empty form
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  // A confirmation the contact page left behind ("Priya was deleted.") shows first
  // The "Save as list" box: open or shut
  const [isSaveListOpen, setIsSaveListOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    readNoticeFromState(location.state),
  );
  const [contactToDelete, setContactToDelete] = useState<{ id: string; displayName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Applies the typed search a moment after the typing stops
  useEffect(() => {
    if (typedSearch.trim() === view.searchText.trim()) return;
    const timer = setTimeout(
      () => setSearchParams(writeContactsView({ ...view, page: 1, searchText: typedSearch })),
      SEARCH_DELAY_MILLISECONDS,
    );
    return () => clearTimeout(timer);
  }, [typedSearch, view, setSearchParams]);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1, and the ticks are cleared: they belong to the contacts that were on screen.
  const changeView = (changes: Partial<ContactsView>) => {
    setSelectedContactIds(new Set());
    setSearchParams(writeContactsView({ ...view, page: 1, ...changes }));
  };
  const clearFilters = () => {
    setTypedSearch('');
    setSelectedContactIds(new Set());
    setSearchParams(writeContactsView(DEFAULT_CONTACTS_VIEW));
  };
  const openCreatePanel = () => {
    setNotice(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  const handleContactCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    setNotice({ tone: 'success', text: formatMessage('contacts.created', { name: displayName }) });
    contactsResource.reload();
  };
  // Deletes the contact the manager said yes to, then loads the list again
  const confirmDelete = async () => {
    if (contactToDelete === null) return;
    setIsDeleting(true);
    try {
      await apiRequest('DELETE', `/contacts/${contactToDelete.id}`);
      setNotice({
        tone: 'success',
        text: formatMessage('contactPage.delete.done', { name: contactToDelete.displayName }),
      });
    } catch (error) {
      setNotice({ tone: 'error', text: describeContactSaveProblem(error) });
    }
    setContactToDelete(null);
    setIsDeleting(false);
    contactsResource.reload();
  };
  const renderRowMenu = (contact: Contact, displayName: string) => (
    <ContactRowMenu
      contact={contact}
      displayName={displayName}
      signedInUserRole={user.role}
      onOpen={() => navigate(`/contacts/${contact.id}`, { state: { listSearch: location.search } })}
      onDelete={() => setContactToDelete({ id: contact.id, displayName })}
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
              {t('contacts.dismiss')}
            </Button>
          }
        >
          {notice.text}
        </Alert>
      ) : null}
      <ContactsToolbar
        view={view}
        typedSearch={typedSearch}
        onTypedSearchChange={setTypedSearch}
        onChangeView={changeView}
        onClearFilters={clearFilters}
        onAddContact={openCreatePanel}
        onSaveAsList={() => setIsSaveListOpen(true)}
        isManager={user.role === 'manager'}
      />
      {isSaveListOpen ? (
        <SaveListDialog
          view={view}
          onClose={() => setIsSaveListOpen(false)}
          onSaved={(list) => {
            setIsSaveListOpen(false);
            setNotice({ tone: 'success', text: describeListMade(list.name, list.memberCount) });
          }}
        />
      ) : null}
      <CreateContactPanel
        key={createPanelOpenCount}
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        onCreated={handleContactCreated}
      />
      <ConfirmDialog
        isOpen={contactToDelete !== null}
        tone="danger"
        title={formatMessage('contactPage.delete.title', { name: contactToDelete?.displayName ?? '' })}
        description={t('contactPage.delete.description')}
        confirmLabel={t('contactPage.delete.confirm')}
        cancelLabel={t('contacts.form.cancel')}
        closeLabel={t('contactPage.delete.close')}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setContactToDelete(null)}
      />
    </>
  );

  const state = contactsResource.state;
  if (state.status === 'loading') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('contacts.loading')} rows={6} />
        </Card>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState
            title={t('contacts.loadError.title')}
            description={t('contacts.loadError.description')}
            action={<Button onClick={contactsResource.reload}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }
  if (state.data.total === 0) {
    const hasFilters = countActiveContactFilters(view) > 0;
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          {hasFilters ? (
            <EmptyState
              icon={<ContactsIcon size={24} />}
              title={t('contacts.noMatch.title')}
              description={t('contacts.noMatch.description')}
              action={<Button onClick={clearFilters}>{t('leads.filter.clear')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<ContactsIcon size={24} />}
              title={t('page.contacts.emptyTitle')}
              description={t('page.contacts.emptyDescription')}
              action={
                <Button variant="primary" onClick={openCreatePanel}>
                  {t('contacts.add')}
                </Button>
              }
            />
          )}
        </Card>
      </div>
    );
  }

  // The list: a table (tablet, desktop) or cards (phone), with Previous and Next under it
  const { items, total, page, limit } = state.data;
  const toggleContact = (contactId: string) => {
    const nextSelection = new Set(selectedContactIds);
    if (nextSelection.has(contactId)) nextSelection.delete(contactId);
    else nextSelection.add(contactId);
    setSelectedContactIds(nextSelection);
  };
  const toggleAllContacts = () => {
    const areAllSelected = items.every((contact) => selectedContactIds.has(contact.id));
    setSelectedContactIds(areAllSelected ? new Set() : new Set(items.map((contact) => contact.id)));
  };
  const lastPage = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  const footer = (
    <Pagination
      summary={formatMessage('contacts.showing', { shown: describeShownRange(page, limit, total), total })}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('contacts.pagination')}
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
        <ContactCards contacts={items} renderRowMenu={renderRowMenu} />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <ContactsTable
          contacts={items}
          selectedContactIds={selectedContactIds}
          onToggleContact={toggleContact}
          onToggleAllContacts={toggleAllContacts}
          renderRowMenu={renderRowMenu}
        />
        {footer}
      </Card>
    </div>
  );
}
