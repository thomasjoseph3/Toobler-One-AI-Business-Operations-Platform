import { Inbox } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@toobler-one/ui';
import { t } from '../app/i18n';
import type { NavigationItem } from '../app/navigation';

/** A page that exists in the menu but whose feature is not built yet: its title and an honest empty state. */
export function PlaceholderPage({ item }: { item: NavigationItem }) {
  return (
    <>
      <PageHeader title={t(item.labelKey)} description={t(item.descriptionKey)} />
      <Card>
        <EmptyState
          icon={<Inbox aria-hidden className="size-6" />}
          title={t('placeholder.title')}
          description={t('placeholder.description')}
        />
      </Card>
    </>
  );
}
