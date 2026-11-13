import { NavLink } from 'react-router';
import { joinClassNames, LogoOne } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from '../navigation';

/**
 * The dark side navigation for tablets and desktops. From 1280 px it is the full sidebar (256 px, icons with words); from
 * 768 to 1279 px it folds to a compact sidebar of icons (72 px) whose links keep their names for screen readers. Hidden on phones.
 */
export function Sidebar() {
  return (
    <nav
      aria-label={t('nav.main')}
      className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar px-3 py-4 md:flex xl:w-[256px]"
    >
      <div className="mb-2 flex h-8 items-center px-2">
        <LogoOne title={t('app.name')} className="h-auto w-10 text-sidebar-logo xl:w-[58px]" />
      </div>
      {NAVIGATION_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p className="text-label-xs-caps hidden px-2 pb-1 text-sidebar-section xl:block">{t(group.labelKey)}</p>
          {NAVIGATION_ITEMS.filter((item) => item.group === group.id).map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
              className={({ isActive }) =>
                joinClassNames(
                  'text-body-sm-medium flex items-center justify-center gap-3 rounded-md px-2.5 py-1.5 xl:justify-start',
                  isActive
                    ? 'bg-sidebar-item-active-bg text-sidebar-item-active'
                    : 'text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover',
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              <span className="hidden xl:inline">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
