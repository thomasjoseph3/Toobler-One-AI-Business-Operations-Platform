import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { AddListMembersResponse, ListMembersResponse } from '@toobler-one/shared';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextField,
} from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { findLeadDisplayName } from '../leads/lead-display';
import { useSession } from '../../auth/session';
import { MINIMUM_SEARCH_LENGTH, useContactSearch } from '../leads/useContactSearch';
import { useKeptData } from '../knowledge/use-kept-resource';

/** How many people one page of a list shows. */
const MEMBERS_PAGE_SIZE = 25;

/** One plain sentence for a refused or failed adding. Never a code or a status number. */
function describeAddProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 404) return t('lists.error.gone');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('leads.error.unknown');
}

/**
 * One contact list (`/contacts/lists/<id>`): its people, 25 to a page, and a search box to add more people (`POST /lists/{id}/members`). Loading, error (with a
 * retry), empty and "no longer exists" states. A person already in the list is said so instead of being added twice.
 */
export function ListPage() {
  const { listId = '' } = useParams();
  const navigate = useNavigate();
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  // The person to take out (asks "Are you sure?" naming them), and whether the whole list is being deleted
  const [personToRemove, setPersonToRemove] = useState<{ id: string; displayName: string } | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [page, setPage] = useState(1);
  const resource = useApiResource<ListMembersResponse>(
    `/lists/${listId}/members?page=${page}&limit=${MEMBERS_PAGE_SIZE}`,
  );
  const kept = useKeptData(resource.state);
  const [typedSearch, setTypedSearch] = useState('');
  const search = useContactSearch(typedSearch);
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Puts one person in the list, then loads the list again
  async function addPerson(contactId: string, displayName: string) {
    setNotice(null);
    setIsAdding(true);
    try {
      const answer = await apiRequest<AddListMembersResponse>('POST', `/lists/${listId}/members`, {
        contactIds: [contactId],
      });
      setNotice({
        tone: 'success',
        text: formatMessage(answer.added === 0 ? 'lists.add.already' : 'lists.add.done', { name: displayName }),
      });
      setTypedSearch('');
      resource.reload();
    } catch (error) {
      setNotice({ tone: 'error', text: describeAddProblem(error) });
    } finally {
      setIsAdding(false);
    }
  }

  // Takes the person out of the list (after the person said yes), then loads the list again
  async function removePerson() {
    if (personToRemove === null) return;
    setIsBusy(true);
    try {
      await apiRequest('DELETE', `/lists/${listId}/members/${personToRemove.id}`);
      setNotice({ tone: 'success', text: formatMessage('lists.remove.done', { name: personToRemove.displayName }) });
    } catch (error) {
      setNotice({ tone: 'error', text: describeAddProblem(error) });
    }
    setPersonToRemove(null);
    setIsBusy(false);
    resource.reload();
  }

  // Deletes the whole list (managers, after "Are you sure?"), then goes back to the lists with the news
  async function deleteList(listName: string) {
    setIsBusy(true);
    try {
      await apiRequest('DELETE', `/lists/${listId}`);
      navigate('/contacts/lists', {
        state: { notice: { tone: 'success', text: formatMessage('lists.delete.done', { name: listName }) } },
      });
    } catch (error) {
      setIsConfirmingDelete(false);
      setNotice({ tone: 'error', text: describeAddProblem(error) });
      setIsBusy(false);
    }
  }

  const backLink = (
    <Link
      to="/contacts/lists"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('lists.backToLists')}
    </Link>
  );

  const data = kept.data;
  if (kept.isFirstLoad) {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('lists.loading')} rows={4} />
        </Card>
      </>
    );
  }
  if (kept.hasFailed || data === null) {
    const isMissing = resource.state.status === 'error' && resource.state.httpStatus === 404;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState
              icon={<ContactsIcon size={24} />}
              title={t('lists.notFound.title')}
              description={t('lists.notFound.description')}
            />
          ) : (
            <ErrorState
              title={t('lists.loadError.title')}
              description={t('lists.loadError.description')}
              action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
            />
          )}
        </Card>
      </>
    );
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
  const firstShown = (data.page - 1) * data.limit + 1;
  return (
    <>
      {backLink}
      <h2 className="text-heading-lg text-text-primary [overflow-wrap:anywhere]">{data.list.name}</h2>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-body-md text-text-secondary">{formatMessage('lists.members', { count: data.total })}</p>
        {isManager ? (
          <Button size="compact" disabled={isBusy} onClick={() => setIsConfirmingDelete(true)}>
            {t('lists.delete.button')}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        isOpen={isConfirmingDelete}
        tone="danger"
        title={formatMessage('lists.delete.title', { name: data.list.name })}
        description={t('lists.delete.description')}
        confirmLabel={t('lists.delete.confirm')}
        cancelLabel={t('leadForm.cancel')}
        closeLabel={t('leadForm.close')}
        isConfirming={isBusy}
        onConfirm={() => void deleteList(data.list.name)}
        onCancel={() => setIsConfirmingDelete(false)}
      />
      <ConfirmDialog
        isOpen={personToRemove !== null}
        tone="danger"
        title={formatMessage('lists.remove.title', { name: personToRemove?.displayName ?? '', list: data.list.name })}
        description={t('lists.remove.description')}
        confirmLabel={t('lists.remove.confirm')}
        cancelLabel={t('leadForm.cancel')}
        closeLabel={t('leadForm.close')}
        isConfirming={isBusy}
        onConfirm={() => void removePerson()}
        onCancel={() => setPersonToRemove(null)}
      />
      {notice !== null ? (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      ) : null}
      <Card className="mb-4 flex flex-col gap-3">
        <h3 className="text-heading-md text-text-primary">{t('lists.add.heading')}</h3>
        <TextField
          label={t('lists.add.search')}
          type="search"
          value={typedSearch}
          onChange={(event) => setTypedSearch(event.target.value)}
          autoComplete="off"
          helperText={formatMessage('lists.add.hint', { count: MINIMUM_SEARCH_LENGTH })}
        />
        {search.status === 'searching' ? (
          <p className="text-body-sm text-text-secondary">{t('search.searching')}</p>
        ) : null}
        {search.status === 'error' ? (
          <p role="alert" className="text-body-sm text-error">
            {t('search.error')}
          </p>
        ) : null}
        {search.status === 'found' && search.people.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('search.nothingFound')}</p>
        ) : null}
        {search.status === 'found' ? (
          <ul className="flex flex-col gap-1">
            {search.people.map((person) => {
              const displayName = findLeadDisplayName(person);
              return (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2"
                >
                  <span className="text-body-md text-text-primary [overflow-wrap:anywhere]">
                    {displayName}
                    {person.name && person.phone ? (
                      <span className="text-body-sm text-text-secondary"> · {person.phone}</span>
                    ) : null}
                  </span>
                  <Button
                    size="compact"
                    disabled={isAdding}
                    aria-label={formatMessage('lists.add.button.label', { name: displayName })}
                    onClick={() => void addPerson(person.id, displayName)}
                  >
                    {t('lists.add.button')}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
      <Card isFlush>
        {data.total === 0 ? (
          <EmptyState
            icon={<ContactsIcon size={24} />}
            title={t('lists.members.empty.title')}
            description={t('lists.members.empty.description')}
          />
        ) : (
          <>
            <Table aria-label={t('lists.members.table')}>
              <TableHead>
                <tr>
                  <TableHeaderCell>{t('lists.members.name')}</TableHeaderCell>
                  <TableHeaderCell>{t('lists.members.phone')}</TableHeaderCell>
                  <TableHeaderCell>{t('lists.members.email')}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{t('lists.members.actions')}</span>
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {data.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="text-text-primary [overflow-wrap:anywhere]">
                      <Link to={`/contacts/${member.id}`} className="text-link hover:text-link-hover hover:underline">
                        {findLeadDisplayName(member)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{member.phone}</TableCell>
                    <TableCell className="[overflow-wrap:anywhere]">{member.email}</TableCell>
                    <TableCell className="w-28">
                      <Button
                        size="compact"
                        disabled={isBusy}
                        aria-label={formatMessage('lists.remove.button.label', { name: findLeadDisplayName(member) })}
                        onClick={() => setPersonToRemove({ id: member.id, displayName: findLeadDisplayName(member) })}
                      >
                        {t('lists.remove.button')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              summary={formatMessage('filtered.summary', {
                from: firstShown,
                to: firstShown + data.items.length - 1,
                total: data.total,
              })}
              previousLabel={t('filtered.previous')}
              nextLabel={t('filtered.next')}
              ariaLabel={t('lists.pagination')}
              hasPrevious={page > 1}
              hasNext={page < lastPage}
              onPrevious={() => setPage(page - 1)}
              onNext={() => setPage(page + 1)}
            />
          </>
        )}
      </Card>
    </>
  );
}
