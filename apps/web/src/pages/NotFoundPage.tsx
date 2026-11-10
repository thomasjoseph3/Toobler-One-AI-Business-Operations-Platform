import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Card, EmptyState } from '@toobler-one/ui';
import { t } from '../app/i18n';

/** Shown for any address that is not a page, which is also what a switched-off module looks like. */
export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<SearchX aria-hidden className="size-6" />}
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={
          <Link
            to="/"
            className="text-sm-button inline-flex h-10 items-center rounded-md bg-action px-4 text-white hover:bg-action-hover"
          >
            {t('notFound.back')}
          </Link>
        }
      />
    </Card>
  );
}
