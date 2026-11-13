import { useState } from 'react';
import { NavLink } from 'react-router';
import { IconButton, joinClassNames, LogoOne, SidebarToggleIcon } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS, type NavigationItem } from '../navigation';
import { UserMenu } from './UserMenu';

/** One menu link in the sidebar (Figma "Link"): a 16 px icon and the page name; the name is hidden when the sidebar is compact. */
function SidebarLink({ item, isExpanded }: { item: NavigationItem; isExpanded: boolean }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      aria-label={t(item.labelKey)}
      title={t(item.labelKey)}
      className={({ isActive }) =>
        joinClassNames(
          'text-body-sm-medium flex items-center justify-center gap-3 rounded-md px-2.5 py-1.5',
          isExpanded ? 'xl:justify-start' : '',
          isActive
            ? 'bg-sidebar-item-active-bg text-sidebar-item-active'
            : 'text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover',
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      <span className={isExpanded ? 'hidden xl:inline' : 'hidden'}>{t(item.labelKey)}</span>
    </NavLink>
  );
}

/**
 * The dark side navigation for tablets and desktops, laid out as in the Figma frame: logo and collapse button, the menu
 * groups, then Settings and the signed-in person's card at the bottom. From 1280 px it is the full sidebar (256 px, icons
 * with words) until the person collapses it; from 768 to 1279 px it is the compact sidebar of icons (72 px) whose links
 * keep their names for screen readers. Hidden on phones, where the bottom bar takes over.
 */
export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isExpanded = !isCollapsed;
  return (
    <nav
      aria-label={t('nav.main')}
      className={joinClassNames(
        'scrollbar-hidden sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto bg-sidebar px-3 pb-3 md:flex md:w-[72px]',
        isExpanded ? 'xl:w-[256px]' : '',
      )}
    >
      <div className="flex h-[68px] shrink-0 items-center justify-center gap-2 px-2 xl:justify-between">
        <LogoOne
          title={t('app.name')}
          className={joinClassNames('h-auto w-10 text-sidebar-logo', isExpanded ? 'xl:w-[58px]' : '')}
        />
        <IconButton
          label={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
          icon={<SidebarToggleIcon size={20} />}
          onClick={() => setIsCollapsed((wasCollapsed) => !wasCollapsed)}
          className="hidden text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover xl:inline-flex"
        />
      </div>
      <div className="flex flex-1 flex-col gap-6 pt-4 [@media(max-height:719px)]:gap-4">
        {NAVIGATION_GROUPS.filter((group) => group.id !== 'footer').map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5 [@media(max-height:719px)]:gap-1">
            {group.labelKey ? (
              <p
                className={joinClassNames(
                  'text-label-xs-caps px-2.5 text-sidebar-section',
                  isExpanded ? 'hidden xl:block' : 'hidden',
                )}
              >
                {t(group.labelKey)}
              </p>
            ) : null}
            {NAVIGATION_ITEMS.filter((item) => item.group === group.id).map((item) => (
              <SidebarLink key={item.id} item={item} isExpanded={isExpanded} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-4">
        {NAVIGATION_ITEMS.filter((item) => item.group === 'footer').map((item) => (
          <SidebarLink key={item.id} item={item} isExpanded={isExpanded} />
        ))}
        <UserMenu variant="card" isCompact={!isExpanded} />
      </div>
    </nav>
  );
}
