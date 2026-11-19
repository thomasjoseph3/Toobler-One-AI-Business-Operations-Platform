import { useState } from 'react';
import type { AuditLogResponse, TeamResponse } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState, Pagination, SelectField, TextField } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { SettingsTabs } from '../settings/SettingsTabs';
import { readWallClock } from '../tasks/zoned-time';
import {
  ACTIVITY_GROUPS,
  buildAuditLogPath,
  describeActivityActor,
  describeActivityKind,
  EMPTY_ACTIVITY_FILTERS,
  type ActivityFilters,
} from './activity-state';

/** A moment as the business's clock shows it, like "18 Nov 2026, 14:05". */
function formatMoment(isoMoment: string, timeZone: string): string {
  const { date, time } = readWallClock(new Date(isoMoment), timeZone);
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  return `${day}, ${time}`;
}

/**
 * Settings → Activity (managers only): who did what, when, newest first. A manager can narrow it by person, by what kind of thing, and by day
 * (the business's own days). Only what was changed is listed, never the words of notes, messages or settings. Loading, error and empty states;
 * keeps the lines on screen while a new filter loads.
 */
export function ActivityPage() {
  const { sessionState } = useSession();
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_ACTIVITY_FILTERS);
  const timeZone = sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC';
  const logResource = useApiResource<AuditLogResponse>(buildAuditLogPath(filters, timeZone));
  const peopleResource = useApiResource<TeamResponse>('/team');
  const log = useKeptData(logResource.state);
  const people = useKeptData(peopleResource.state);

  // Any change of filter goes back to the first page
  const changeFilters = (changes: Partial<ActivityFilters>) =>
    setFilters((current) => ({ ...current, page: 1, ...changes }));

  if (log.isFirstLoad || people.isFirstLoad) return <LoadingState label={t('activity.loading')} />;
  if (log.hasFailed || log.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('activity.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={logResource.reload}>
              {t('team.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const { items, total, page, limit } = log.data;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const firstShown = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastShown = Math.min(total, page * limit);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <p className="text-body-md max-w-prose text-text-secondary">{t('activity.intro')}</p>
      <form
        aria-label={t('activity.filters.label')}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <SelectField
          label={t('activity.filters.person')}
          value={filters.personUserId}
          onChange={(event) => changeFilters({ personUserId: event.target.value })}
          options={[
            { value: '', label: t('activity.filters.anyone') },
            ...(people.data?.members ?? []).map((member) => ({ value: member.id, label: member.name })),
          ]}
        />
        <SelectField
          label={t('activity.filters.area')}
          value={filters.groupKey}
          onChange={(event) => changeFilters({ groupKey: event.target.value })}
          options={ACTIVITY_GROUPS.map((group) => ({ value: group.key, label: t(group.labelKey) }))}
        />
        <TextField
          label={t('activity.filters.from')}
          type="date"
          value={filters.fromDate}
          onChange={(event) => changeFilters({ fromDate: event.target.value })}
        />
        <TextField
          label={t('activity.filters.to')}
          type="date"
          value={filters.toDate}
          onChange={(event) => changeFilters({ toDate: event.target.value })}
        />
      </form>
      <Card>
        {items.length === 0 ? <p className="text-body-md text-text-secondary">{t('activity.empty')}</p> : null}
        <ul>
          {items.map((line) => (
            <li key={line.id} className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
              <p className="text-body-md text-text-primary">
                <span className="text-label-md">{describeActivityActor(line.actor)}</span>{' '}
                {describeActivityKind(line.kind)}
              </p>
              <p className="text-label-sm text-text-secondary">
                {formatMoment(line.createdAt, timeZone)}
                {line.fields.length > 0
                  ? ` · ${formatMessage('activity.fields', { fields: line.fields.join(', ') })}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Pagination
        summary={formatMessage('activity.showing', { shown: `${firstShown}-${lastShown}`, total })}
        previousLabel={t('leads.previous')}
        nextLabel={t('leads.next')}
        ariaLabel={t('activity.pagination')}
        hasPrevious={page > 1}
        hasNext={page < lastPage}
        onPrevious={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
        onNext={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
      />
    </div>
  );
}
