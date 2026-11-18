import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { ContactListsResponse } from '@toobler-one/shared';
import {
  Button,
  Card,
  ContactsIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';

/**
 * The contact lists (`/contacts/lists`): the fixed groups of contacts the business has saved, each with how many people it holds. Loading, error (with a retry)
 * and empty states; the empty one says how to make a list. Opening a list, adding and removing people and deleting a list come in the next slices.
 */
export function ListsPage() {
  const resource = useApiResource<ContactListsResponse>('/lists');
  const backLink = (
    <Link
      to="/contacts"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('lists.back')}
    </Link>
  );

  let body;
  if (resource.state.status === 'loading') {
    body = <LoadingState label={t('lists.loading')} rows={4} />;
  } else if (resource.state.status === 'error') {
    body = (
      <ErrorState
        title={t('lists.loadError.title')}
        description={t('lists.loadError.description')}
        action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
      />
    );
  } else if (resource.state.data.items.length === 0) {
    body = (
      <EmptyState
        icon={<ContactsIcon size={24} />}
        title={t('lists.empty.title')}
        description={t('lists.empty.description')}
      />
    );
  } else {
    body = (
      <Table aria-label={t('lists.heading')}>
        <TableHead>
          <tr>
            <TableHeaderCell>{t('lists.column.name')}</TableHeaderCell>
            <TableHeaderCell>{t('lists.column.members')}</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {resource.state.data.items.map((list) => (
            <TableRow key={list.id}>
              <TableCell className="text-text-primary [overflow-wrap:anywhere]">
                <Link to={`/contacts/lists/${list.id}`} className="text-link hover:text-link-hover hover:underline">
                  {list.name}
                </Link>
              </TableCell>
              <TableCell>{formatMessage('lists.members', { count: list.memberCount })}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <>
      {backLink}
      <h2 className="text-heading-lg text-text-primary">{t('lists.heading')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('lists.description')}</p>
      <Card isFlush>{body}</Card>
    </>
  );
}
