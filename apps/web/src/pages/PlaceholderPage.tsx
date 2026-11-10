import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Card, EmptyState, PageHeader } from '@toobler-one/ui';
import { t, type MessageKey, type PageId } from '../app/i18n';
import type { NavigationItem } from '../app/navigation';

/** Pages where "set up a channel" is the honest next step (nothing arrives until a channel is on). */
const PAGES_THAT_START_WITH_CHANNELS: readonly PageId[] = ['today', 'leads', 'inbox'];

/** The three things each page will show, as text keys. */
const previewKeys = (pageId: PageId): MessageKey[] => [
  `page.${pageId}.preview1`,
  `page.${pageId}.preview2`,
  `page.${pageId}.preview3`,
];

/** The greeting for the hour of the day, shown as the title of the Today page. */
function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return t('today.greeting.morning');
  if (hour < 17) return t('today.greeting.afternoon');
  return t('today.greeting.evening');
}

/** Today's date as "Tuesday 10 Nov 2026" (the design system's unambiguous date style). */
const formatTodayDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(date);

/**
 * A page whose feature is not built yet. It still says something useful: what belongs here, what the page will show,
 * and (where it is true) the one thing to do next. Today also greets the person and shows the date.
 */
export function PlaceholderPage({ item }: { item: NavigationItem }) {
  const now = new Date();
  const isToday = item.id === 'today';
  const title = isToday ? greetingFor(now) : t(item.labelKey);
  const description = isToday ? `${formatTodayDate(now)}. ${t(item.descriptionKey)}` : t(item.descriptionKey);

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <EmptyState
            icon={<item.icon aria-hidden className="size-6" />}
            title={t(`page.${item.id}.emptyTitle`)}
            description={t(`page.${item.id}.emptyDescription`)}
            action={
              PAGES_THAT_START_WITH_CHANNELS.includes(item.id) ? (
                <Link
                  to="/channels"
                  className="text-sm-button inline-flex h-10 items-center rounded-md bg-action px-4 text-white hover:bg-action-hover active:bg-action-pressed"
                >
                  {t('page.setUpChannels')}
                </Link>
              ) : undefined
            }
          />
        </Card>
        <Card>
          <h2 className="text-base-heading mb-3 text-text-primary">{t('page.previewHeading')}</h2>
          <ul className="flex flex-col gap-3">
            {previewKeys(item.id).map((messageKey) => (
              <li key={messageKey} className="text-sm-body flex gap-3 text-text-secondary">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-action" />
                {t(messageKey)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
