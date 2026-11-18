import type { AuditLogLine } from '@toobler-one/shared';
import { formatMessage, hasMessage, t, type MessageKey } from '../../app/i18n';
import { wallClockToIsoMoment } from '../tasks/zoned-time';

// The pure logic of Settings → Activity: the groups of areas the manager can pick, the request address, and the words for a line.

/** The groups offered in the "What" list: each is the areas (the part of a kind before the dot) it stands for. */
export const ACTIVITY_GROUPS: ReadonlyArray<{ key: string; labelKey: MessageKey; areas: readonly string[] }> = [
  { key: 'all', labelKey: 'activity.group.all', areas: [] },
  { key: 'signIns', labelKey: 'activity.group.signIns', areas: ['auth'] },
  { key: 'team', labelKey: 'activity.group.team', areas: ['team', 'teams'] },
  { key: 'leads', labelKey: 'activity.group.leads', areas: ['leads', 'pipeline', 'lost_reasons', 'assignment_rules'] },
  { key: 'contacts', labelKey: 'activity.group.contacts', areas: ['contacts'] },
  { key: 'tickets', labelKey: 'activity.group.tickets', areas: ['tickets'] },
  { key: 'tasks', labelKey: 'activity.group.tasks', areas: ['tasks'] },
  { key: 'notes', labelKey: 'activity.group.notes', areas: ['activities'] },
  {
    key: 'business',
    labelKey: 'activity.group.business',
    areas: [
      'business',
      'setup',
      'webchat',
      'knowledge',
      'offerings',
      'offers',
      'conversations',
      'ai',
      'platform',
      'industries',
    ],
  },
];

/** What the manager picked to narrow the activity by. Dates are typed as "2026-11-17" (the business's own days). */
export interface ActivityFilters {
  personUserId: string;
  groupKey: string;
  fromDate: string;
  toDate: string;
  page: number;
}

/** No filters, the first page. */
export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = {
  personUserId: '',
  groupKey: 'all',
  fromDate: '',
  toDate: '',
  page: 1,
};

/** How many lines one page shows. */
export const ACTIVITY_PAGE_SIZE = 50;

/**
 * The address for `GET /audit-log` with these filters. A "From" day starts at midnight and a "To" day ends at the next midnight, both on the
 * business's own clock, so a day means the business's day.
 */
export function buildAuditLogPath(filters: ActivityFilters, timeZone: string): string {
  const parameters = new URLSearchParams();
  if (filters.personUserId) parameters.set('person', filters.personUserId);
  const group = ACTIVITY_GROUPS.find((candidate) => candidate.key === filters.groupKey);
  if (group && group.areas.length > 0) parameters.set('area', group.areas.join(','));
  const from = filters.fromDate ? wallClockToIsoMoment(filters.fromDate, '00:00', timeZone) : null;
  if (from) parameters.set('from', from);
  const toDayStart = filters.toDate ? wallClockToIsoMoment(filters.toDate, '00:00', timeZone) : null;
  if (toDayStart) {
    // The "To" day is included in full: the log is read up to the start of the day after it
    const nextDay = new Date(new Date(toDayStart).getTime() + 24 * 3_600_000);
    parameters.set('to', nextDay.toISOString());
  }
  parameters.set('page', String(filters.page));
  parameters.set('limit', String(ACTIVITY_PAGE_SIZE));
  return `/audit-log?${parameters.toString()}`;
}

/** Who did it, in words: the person's name, or "The AI agent", "Toobler One" and so on. */
export function describeActivityActor(actor: AuditLogLine['actor']): string {
  if (actor.kind === 'user') return actor.name ?? t('activity.actor.someone');
  const keyByKind: Record<string, MessageKey> = {
    agent: 'activity.actor.agent',
    system: 'activity.actor.system',
    import: 'activity.actor.import',
    assistant: 'activity.actor.assistant',
  };
  return t(keyByKind[actor.kind] ?? 'activity.actor.someone');
}

/** What happened, in words ("invited someone to the team"). A kind the screen has no words for yet is shown with its own name, so nothing is hidden. */
export function describeActivityKind(kind: string): string {
  const key = `activity.kind.${kind}`;
  return hasMessage(key) ? t(key) : formatMessage('activity.kind.unknown', { kind });
}
