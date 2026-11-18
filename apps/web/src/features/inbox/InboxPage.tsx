import { Link, useSearchParams } from 'react-router';
import type { InboxItem, InboxResponse } from '@toobler-one/shared';
import { Button, Card, EmptyState, ErrorState, LoadingState, Pagination, SharedInboxIcon, Tag } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { formatMoment } from '../leads/lead-display';
import { useKeptData } from '../knowledge/use-kept-resource';
import {
  buildInboxApiPath,
  CHANNEL_CHOICES,
  CHANNEL_MESSAGE_KEYS,
  describeSender,
  readInboxView,
  writeInboxView,
  type InboxView,
} from './inbox-state';
import { useLiveUpdates } from './use-live-updates';

/** How many conversations show on one page. */
const INBOX_PAGE_SIZE = 25;

/** One filter button: pressed means the filter is on. The pressed state is said in words for people who cannot see the colour. */
function FilterChip({ label, isOn, onPress }: { label: string; isOn: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onPress}
      className={`text-body-md-semibold h-9 rounded-full border px-3 ${
        isOn
          ? 'border-border-focus bg-selected text-text-primary'
          : 'border-border-default bg-surface text-text-secondary hover:bg-hover'
      }`}
    >
      {isOn ? `✓ ${label}` : label}
    </button>
  );
}

/** One row of the inbox. */
function InboxRow({ item, timeZone }: { item: InboxItem; timeZone: string }) {
  return (
    <li>
      <Link
        to={`/inbox/${item.id}`}
        className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Card isCompact className="flex flex-col gap-2 hover:bg-hover">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="neutral">{t(CHANNEL_MESSAGE_KEYS[item.channel])}</Tag>
            <span className="text-body-md-semibold text-text-primary [overflow-wrap:anywhere]">
              {describeSender(item)}
            </span>
            {item.needsPerson ? <Tag tone="lost">{t('inbox.needsPerson')}</Tag> : null}
            {item.aiUnsure ? <Tag tone="rate-sent">{t('inbox.aiUnsure')}</Tag> : null}
            {item.type ? <Tag tone="neutral">{item.type.label}</Tag> : null}
            {item.heldBy ? (
              <Tag tone="qualified">
                {formatMessage('inbox.heldBy', { name: item.heldBy.name ?? t('inbox.someone') })}
              </Tag>
            ) : null}
            {item.doneAt ? <Tag tone="won">{t('inbox.done')}</Tag> : null}
          </div>
          <p className="text-body-md text-text-secondary [overflow-wrap:anywhere]">
            {item.preview ?? t('inbox.noWordsYet')}
          </p>
          <p className="text-body-sm text-text-secondary">{formatMoment(item.lastActivityAt, timeZone)}</p>
        </Card>
      </Link>
    </li>
  );
}

/**
 * The Inbox (`/inbox`): every real conversation from every channel, the ones that need a person first, then the newest. Filters for channel, open or
 * done, "held by me" and "needs a person" live in the address. It refreshes by itself when something happens (live updates). Loading, error (with a
 * retry) and empty states.
 */
export function InboxPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readInboxView(searchParams);
  const resource = useApiResource<InboxResponse>(buildInboxApiPath(view, INBOX_PAGE_SIZE));
  const kept = useKeptData(resource.state);
  useLiveUpdates(resource.reload);
  const timeZone = sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC';

  /** Changes the view; any change except the page goes back to the first page. */
  function changeView(changes: Partial<InboxView>) {
    // Built from the address as it is at the moment of the click (not from the last drawing of the page), so two quick clicks never undo each other
    const currentView = readInboxView(new URLSearchParams(window.location.search));
    setSearchParams(writeInboxView({ ...currentView, page: 1, ...changes }));
  }

  const data = kept.data;
  let body;
  if (kept.isFirstLoad) {
    body = <LoadingState label={t('inbox.loading')} rows={4} />;
  } else if (kept.hasFailed || data === null) {
    body = (
      <ErrorState
        title={t('inbox.loadError.title')}
        description={t('inbox.loadError.description')}
        action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
      />
    );
  } else if (data.items.length === 0) {
    body = (
      <EmptyState
        icon={<SharedInboxIcon size={24} />}
        title={t('inbox.empty.title')}
        description={t('inbox.empty.description')}
      />
    );
  } else {
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <InboxRow key={item.id} item={item} timeZone={timeZone} />
          ))}
        </ul>
        <div className="mt-4 overflow-hidden rounded-md border border-border-subtle">
          <Pagination
            summary={formatMessage('inbox.summary', {
              from: (data.page - 1) * data.limit + 1,
              to: (data.page - 1) * data.limit + data.items.length,
              total: data.total,
            })}
            previousLabel={t('filtered.previous')}
            nextLabel={t('filtered.next')}
            ariaLabel={t('inbox.pagination')}
            hasPrevious={data.page > 1}
            hasNext={data.page < Math.ceil(data.total / data.limit)}
            onPrevious={() => changeView({ page: data.page - 1 })}
            onNext={() => changeView({ page: data.page + 1 })}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="text-heading-lg text-text-primary">{t('nav.inbox')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('page.inbox.description')}</p>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('inbox.filters')}>
        <FilterChip
          label={t('inbox.filter.open')}
          isOn={view.status === 'open'}
          onPress={() => changeView({ status: 'open' })}
        />
        <FilterChip
          label={t('inbox.filter.done')}
          isOn={view.status === 'done'}
          onPress={() => changeView({ status: 'done' })}
        />
        <FilterChip
          label={t('inbox.filter.needsPerson')}
          isOn={view.needsPerson}
          onPress={() => changeView({ needsPerson: !view.needsPerson })}
        />
        <FilterChip
          label={t('inbox.filter.heldByMe')}
          isOn={view.heldByMe}
          onPress={() => changeView({ heldByMe: !view.heldByMe })}
        />
        {CHANNEL_CHOICES.map((channel) => (
          <FilterChip
            key={channel}
            label={t(CHANNEL_MESSAGE_KEYS[channel])}
            isOn={view.channel === channel}
            onPress={() => changeView({ channel: view.channel === channel ? null : channel })}
          />
        ))}
      </div>
      {body}
    </>
  );
}
