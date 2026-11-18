import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { FilteredConversation, FilteredConversationsResponse } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LeadsIcon, LoadingState, Pagination, Tag } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { formatMoment } from './lead-display';
import { useSession } from '../../auth/session';

/** How many filtered conversations show on one page. */
const FILTERED_PAGE_SIZE = 25;

const CHANNEL_WORD_KEYS: Record<FilteredConversation['channel'], MessageKey> = {
  webchat: 'filtered.channel.webchat',
  whatsapp: 'filtered.channel.whatsapp',
  email: 'filtered.channel.email',
  phone: 'filtered.channel.phone',
};

/** Who the conversation came from: their phone or email, or "Unknown sender" (a web chat visitor gave neither). */
function describeSender(conversation: FilteredConversation): string {
  return conversation.fromPhone ?? conversation.fromEmail ?? t('filtered.unknownSender');
}

/**
 * The Filtered tab (`/leads/filtered`): the conversations that were filtered out (spam, wrong numbers, silent calls), newest first, 25 to a page,
 * each with its type, who it came from, the customer's first words and a "Move to leads" button for the one that was a real enquiry. Loading, error
 * (with a retry) and empty states. After a move the list loads again and says so.
 */
export function FilteredPage() {
  const { sessionState } = useSession();
  const [page, setPage] = useState(1);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const resource = useApiResource<FilteredConversationsResponse>(
    `/conversations?filtered=true&page=${page}&limit=${FILTERED_PAGE_SIZE}`,
  );
  const kept = useKeptData(resource.state);
  const timeZone = sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC';

  // Puts one conversation back onto the board, then loads the list again
  async function moveToLeads(conversation: FilteredConversation) {
    setNotice(null);
    setMovingId(conversation.id);
    try {
      await apiRequest('POST', `/conversations/${conversation.id}/unfilter`);
      setNotice({ tone: 'success', text: t('filtered.moved') });
      resource.reload();
    } catch (error) {
      // A 409 means it was already moved by someone else: the list shows the truth after it loads again
      const message =
        error instanceof ApiRequestError && error.status === 409 ? error.message : t('filtered.moveError');
      setNotice({ tone: 'error', text: message });
      resource.reload();
    } finally {
      setMovingId(null);
    }
  }

  const backLink = (
    <Link
      to="/leads"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('filtered.back')}
    </Link>
  );

  const data = kept.data;
  let body;
  if (kept.isFirstLoad) {
    body = <LoadingState label={t('session.loading')} />;
  } else if (kept.hasFailed || data === null) {
    body = (
      <ErrorState
        title={t('filtered.loadError.title')}
        description={t('filtered.loadError.description')}
        action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
      />
    );
  } else if (data.items.length === 0 && data.total === 0) {
    body = (
      <EmptyState
        icon={<LeadsIcon size={24} />}
        title={t('filtered.empty.title')}
        description={t('filtered.empty.description')}
      />
    );
  } else {
    const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
    const from = (data.page - 1) * data.limit + 1;
    const to = from + data.items.length - 1;
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {data.items.map((conversation) => {
            const sender = describeSender(conversation);
            return (
              <li key={conversation.id}>
                <Card isCompact className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="neutral">{conversation.type.label}</Tag>
                      <span className="text-body-md-semibold text-text-primary [overflow-wrap:anywhere]">{sender}</span>
                      <span className="text-body-sm text-text-secondary">
                        {t(CHANNEL_WORD_KEYS[conversation.channel])} · {formatMoment(conversation.createdAt, timeZone)}
                      </span>
                    </div>
                    <p className="text-body-md text-text-secondary [overflow-wrap:anywhere]">
                      {conversation.firstWords ?? t('filtered.noWords')}
                    </p>
                  </div>
                  <Button
                    size="compact"
                    disabled={movingId !== null}
                    aria-label={formatMessage('filtered.moveToLeads.label', { who: sender })}
                    onClick={() => void moveToLeads(conversation)}
                  >
                    {t('filtered.moveToLeads')}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 overflow-hidden rounded-md border border-border-subtle">
          <Pagination
            summary={formatMessage('filtered.summary', { from, to, total: data.total })}
            previousLabel={t('filtered.previous')}
            nextLabel={t('filtered.next')}
            ariaLabel={t('filtered.pagination')}
            hasPrevious={page > 1}
            hasNext={page < lastPage}
            onPrevious={() => setPage(page - 1)}
            onNext={() => setPage(page + 1)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {backLink}
      <h2 className="text-heading-lg text-text-primary">{t('filtered.heading')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('filtered.description')}</p>
      {notice !== null ? (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      {body}
    </>
  );
}
