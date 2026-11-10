import { NavLink } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from '../navigation';

/**
 * The side navigation for tablets and desktops. From 1280 px it is the full rail (232 px, icons with words); from 768 to
 * 1279 px it folds to a compact rail of icons (72 px) whose buttons keep their names for screen readers. Hidden on phones.
 */
export function Rail() {
  return (
    <nav
      aria-label={t('nav.main')}
      className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-3 py-4 md:flex xl:w-[232px]"
    >
      <div className="text-lg-subsection-title flex h-8 items-center gap-2 px-2 text-text-primary">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-action text-sm-button text-white"
        >
          T
        </span>
        <span className="hidden xl:inline">{t('app.name')}</span>
      </div>
      {NAVIGATION_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p className="text-11-caps hidden px-2 pb-1 text-text-secondary xl:block">{t(group.labelKey)}</p>
          {NAVIGATION_ITEMS.filter((item) => item.group === group.id).map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
              className={({ isActive }) =>
                joinClassNames(
                  'text-xs-navigation flex h-10 items-center justify-center gap-3 rounded-md px-2 xl:justify-start',
                  isActive
                    ? 'bg-action-subtle text-action'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )
              }
            >
              <item.icon aria-hidden className="size-5 shrink-0" />
              <span className="hidden xl:inline">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
