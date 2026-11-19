import { Link } from 'react-router';
import type { SavedView } from '@toobler-one/shared';
import { t } from '../../app/i18n';
import { writeLeadsView, type LeadsView } from './leads-view';
import { savedViewToLeadsView } from './saved-views';

export interface ViewTabsProps {
  savedViews: readonly SavedView[];
  /** The saved view the list is showing, if any. */
  activeViewId: string | undefined;
  /** True when the list is the plain, unchanged one ("All leads" is the tab that is on). */
  isPlain: boolean;
}

/** The address of the Leads page showing this view. */
function pathFor(view: LeadsView): string {
  const query = writeLeadsView(view).toString();
  return query === '' ? '/leads' : `/leads?${query}`;
}

/** The classes of one tab: the one that is on is marked by an underline and bold, never by colour alone. */
function tabClasses(isOn: boolean): string {
  return `text-body-md inline-flex h-10 shrink-0 items-center border-b-2 px-3 whitespace-nowrap ${
    isOn
      ? 'text-body-md-semibold border-action text-text-primary'
      : 'border-transparent text-text-secondary hover:text-text-primary'
  }`;
}

/**
 * The tabs above the Leads list: "All leads" and one tab for each saved view (the person's own and the ones a manager shared). A tab opens the Leads
 * list with the view's filters and sort; the tab that matches the list on screen is marked. Nothing shows until the person has saved a view.
 */
export function ViewTabs({ savedViews, activeViewId, isPlain }: ViewTabsProps) {
  if (savedViews.length === 0) return null;
  return (
    <nav aria-label={t('views.tabs.label')} className="mb-3 flex gap-1 overflow-x-auto border-b border-border-subtle">
      <Link to="/leads" aria-current={isPlain ? 'page' : undefined} className={tabClasses(isPlain)}>
        {t('views.tabs.all')}
      </Link>
      {savedViews.map((saved) => (
        <Link
          key={saved.id}
          to={pathFor(savedViewToLeadsView(saved))}
          aria-current={saved.id === activeViewId ? 'page' : undefined}
          className={tabClasses(saved.id === activeViewId)}
        >
          {saved.name}
          {saved.shared ? (
            <span className="text-label-xs ml-2 rounded-sm bg-hover px-1.5 py-0.5 text-text-secondary">
              {t('views.sharedWord')}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
