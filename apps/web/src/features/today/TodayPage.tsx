import { Phone, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TodayLeadItem, TodayResponse, TodayScope, TodayTaskItem } from '@toobler-one/shared';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SegmentedControl,
  TodayIcon,
} from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { useLiveUpdates } from '../inbox/use-live-updates';
import { TemperatureTag } from '../leads/TemperatureTag';

/** The greeting key for the hour of the day in the business's time zone. */
function greetingKey(
  timeZone: string,
): 'today.greeting.morning' | 'today.greeting.afternoon' | 'today.greeting.evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
  );
  if (hour < 12) return 'today.greeting.morning';
  if (hour < 17) return 'today.greeting.afternoon';
  return 'today.greeting.evening';
}

/** A dialler link for an E.164 number. */
const telHref = (phone: string) => `tel:${phone}`;
/** A WhatsApp chat link: wa.me wants the number's digits only (no plus). */
const whatsAppHref = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;

/** The time a task is due, in the business's clock (e.g. "3:30 pm"). */
function dueTime(dueAtIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(dueAtIso),
  );
}

/** The Call and WhatsApp buttons for a phone, or a quiet "no phone" note when there is none. */
function CallButtons({ phone }: { phone: string | null }) {
  if (phone === null) return <span className="text-body-xs text-fg-muted">{t('today.noPhone')}</span>;
  return (
    <div className="flex gap-2">
      <ButtonLink size="compact" href={telHref(phone)} leadingIcon={<Phone size={14} aria-hidden />}>
        {t('today.call')}
      </ButtonLink>
      <ButtonLink
        size="compact"
        variant="primary"
        href={whatsAppHref(phone)}
        target="_blank"
        rel="noreferrer"
        leadingIcon={<MessageCircle size={14} aria-hidden />}
      >
        {t('today.whatsapp')}
      </ButtonLink>
    </div>
  );
}

/** One lead on the page: who it is, how warm, what they want, who owns it (team view), and the Call/WhatsApp buttons. */
function LeadRow({ lead, showOwner }: { lead: TodayLeadItem; showOwner: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <TemperatureTag temperature={lead.temperature} />
          <Link to={`/leads/${lead.leadId}`} className="text-body-sm font-medium hover:underline">
            {lead.contactName ?? t('today.noPhone')}
          </Link>
        </div>
        {lead.interest !== null ? <p className="text-body-xs text-fg-muted mt-1 truncate">{lead.interest}</p> : null}
        {showOwner && lead.ownerName !== null ? (
          <p className="text-label-xs text-fg-muted mt-0.5">{lead.ownerName}</p>
        ) : null}
      </div>
      <CallButtons phone={lead.phone} />
    </li>
  );
}

/** One task on the page: what to do, about whom, when it is due, and the Call/WhatsApp buttons. */
function TaskRow({ task, timeZone, showOwner }: { task: TodayTaskItem; timeZone: string; showOwner: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium">{task.title}</p>
        <p className="text-body-xs text-fg-muted mt-1">
          {task.contactName ?? ''} · {formatMessage('today.task.due', { time: dueTime(task.dueAt, timeZone) })}
          {showOwner && task.ownerName !== null ? ` · ${task.ownerName}` : ''}
        </p>
      </div>
      <CallButtons phone={task.phone} />
    </li>
  );
}

/** A section as a card: its title, how many it holds, and its items or a quiet empty line. */
function Section({
  title,
  count,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="mb-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-label-sm text-fg-muted font-semibold tracking-wide uppercase">{title}</h2>
        {count > 0 ? <span className="text-label-xs text-fg-muted">{count}</span> : null}
      </div>
      {isEmpty ? (
        <p className="text-body-sm text-fg-muted py-2">{emptyLabel}</p>
      ) : (
        <ul className="[&>li]:border-border-subtle [&>li+li]:border-t">{children}</ul>
      )}
    </Card>
  );
}

/**
 * The Today page (F22): the first screen staff see — "who do I call next?". It shows, in order, Late, Hot leads not yet
 * contacted, Due today, Came in overnight and the This week numbers, each lead with Call and WhatsApp. Managers (and
 * staff) can switch between their own work and the team's; the own-leads-only role sees only its own. It refreshes by
 * itself when a lead or task changes (live updates), and has loading, error and empty states.
 */
export function TodayPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope: TodayScope = searchParams.get('scope') === 'team' ? 'team' : 'me';
  const resource = useApiResource<TodayResponse>(`/today?scope=${scope}`);
  const kept = useKeptData(resource.state);
  useLiveUpdates(() => resource.reload());

  // The guard only shows this page to someone signed in; this keeps the types honest.
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;
  const canSeeTeam = user.role !== 'staff_own';

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-heading-md font-semibold">
        {t(greetingKey(business.timeZone))}
        {user.name !== null ? `, ${user.name.split(' ')[0]}` : ''}
      </h2>
      {canSeeTeam ? (
        <SegmentedControl
          ariaLabel={t('today.scope.label')}
          value={scope}
          onChange={(next) => setSearchParams(next === 'team' ? { scope: 'team' } : {})}
          options={[
            { value: 'me', label: t('today.scope.me') },
            { value: 'team', label: t('today.scope.team') },
          ]}
        />
      ) : null}
    </div>
  );

  if (kept.isFirstLoad) {
    return (
      <div>
        {header}
        <Card>
          <LoadingState label={t('today.loading')} rows={6} />
        </Card>
      </div>
    );
  }
  if (kept.hasFailed || kept.data === null) {
    return (
      <div>
        {header}
        <Card>
          <ErrorState
            title={t('today.loadError.title')}
            description={t('today.loadError.description')}
            action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }

  const { sections, setupChecklist } = kept.data;
  const showOwner = scope === 'team';
  const isEverythingEmpty =
    sections.late.leads.length === 0 &&
    sections.late.tasks.length === 0 &&
    sections.hot.length === 0 &&
    sections.dueToday.length === 0 &&
    sections.overnight.length === 0;

  return (
    <div>
      {header}

      {setupChecklist !== null && setupChecklist.unfinishedSteps > 0 ? (
        <Card className="border-border-emphasis mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-body-sm font-medium">{t('today.setup.title')}</p>
            <p className="text-body-xs text-fg-muted">
              {formatMessage('today.setup.count', { count: setupChecklist.unfinishedSteps })}
            </p>
          </div>
          <Link to="/setup">
            <Button variant="secondary" size="compact">
              {t('today.setup.go')}
            </Button>
          </Link>
        </Card>
      ) : null}

      {isEverythingEmpty ? (
        <Card>
          <EmptyState
            icon={<TodayIcon size={24} />}
            title={t('page.today.emptyTitle')}
            description={t('page.today.emptyDescription')}
          />
        </Card>
      ) : (
        <>
          <Section
            title={t('today.section.late')}
            count={sections.late.leads.length + sections.late.tasks.length}
            isEmpty={sections.late.leads.length === 0 && sections.late.tasks.length === 0}
            emptyLabel={t('today.section.lateEmpty')}
          >
            {sections.late.tasks.map((task) => (
              <TaskRow key={task.taskId} task={task} timeZone={business.timeZone} showOwner={showOwner} />
            ))}
            {sections.late.leads.map((lead) => (
              <LeadRow key={lead.leadId} lead={lead} showOwner={showOwner} />
            ))}
          </Section>

          <Section
            title={t('today.section.hot')}
            count={sections.hot.length}
            isEmpty={sections.hot.length === 0}
            emptyLabel={t('today.section.hotEmpty')}
          >
            {sections.hot.map((lead) => (
              <LeadRow key={lead.leadId} lead={lead} showOwner={showOwner} />
            ))}
          </Section>

          <Section
            title={t('today.section.dueToday')}
            count={sections.dueToday.length}
            isEmpty={sections.dueToday.length === 0}
            emptyLabel={t('today.section.dueTodayEmpty')}
          >
            {sections.dueToday.map((task) => (
              <TaskRow key={task.taskId} task={task} timeZone={business.timeZone} showOwner={showOwner} />
            ))}
          </Section>

          <Section
            title={t('today.section.overnight')}
            count={sections.overnight.length}
            isEmpty={sections.overnight.length === 0}
            emptyLabel={t('today.section.overnightEmpty')}
          >
            {sections.overnight.map((lead) => (
              <LeadRow key={lead.leadId} lead={lead} showOwner={showOwner} />
            ))}
          </Section>
        </>
      )}

      <Card>
        <h2 className="text-label-sm text-fg-muted mb-3 font-semibold tracking-wide uppercase">
          {t('today.section.thisWeek')}
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-label-xs text-fg-muted">{t('today.thisWeek.leadsIn')}</dt>
            <dd className="text-heading-sm font-semibold">{sections.thisWeek.leadsIn}</dd>
          </div>
          <div>
            <dt className="text-label-xs text-fg-muted">{t('today.thisWeek.leadsContacted')}</dt>
            <dd className="text-heading-sm font-semibold">{sections.thisWeek.leadsContacted}</dd>
          </div>
          <div>
            <dt className="text-label-xs text-fg-muted">{t('today.thisWeek.leadsWon')}</dt>
            <dd className="text-heading-sm font-semibold">{sections.thisWeek.leadsWon}</dd>
          </div>
          <div>
            <dt className="text-label-xs text-fg-muted">{t('today.thisWeek.avgReply')}</dt>
            <dd className="text-heading-sm font-semibold">
              {sections.thisWeek.averageMinutesToFirstReply === null
                ? t('today.thisWeek.avgReplyNone')
                : formatMessage('today.thisWeek.avgReplyValue', {
                    minutes: sections.thisWeek.averageMinutesToFirstReply,
                  })}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
