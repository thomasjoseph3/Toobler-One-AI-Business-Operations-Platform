import { useState } from 'react';
import { NavLink } from 'react-router';
import { IconButton, joinClassNames, LogoOne, LogoOneMark, SidebarToggleIcon } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS, type NavigationItem } from '../navigation';
import { UserMenu } from './UserMenu';

/** The colours of a menu link: the active page has a lighter row and text, the others brighten when hovered. */
const linkColourClasses = (isActive: boolean) =>
  isActive
    ? 'bg-sidebar-item-active-bg text-sidebar-item-active'
    : 'text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover';

/** One menu link of the full sidebar (Figma "Link"): a 16 px icon and the page name. */
function FullSidebarLink({ item }: { item: NavigationItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        joinClassNames(
          'text-body-sm-medium flex items-center gap-3 rounded-md px-2.5 py-1.5',
          linkColourClasses(isActive),
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      {t(item.labelKey)}
    </NavLink>
  );
}

/** One menu link of the collapsed sidebar (Figma "Link"): just the 16 px icon in a 32 px square. The name is kept for screen readers and the tooltip. */
function CompactSidebarLink({ item }: { item: NavigationItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      aria-label={t(item.labelKey)}
      title={t(item.labelKey)}
      className={({ isActive }) =>
        joinClassNames('flex size-8 items-center justify-center rounded-md', linkColourClasses(isActive))
      }
    >
      <item.icon className="size-4 shrink-0" />
    </NavLink>
  );
}

/** The menu groups without the footer (Settings), each with its items, in the order they appear. */
const MENU_GROUPS = NAVIGATION_GROUPS.filter((group) => group.id !== 'footer').map((group) => ({
  group,
  items: NAVIGATION_ITEMS.filter((item) => item.group === group.id),
}));
const FOOTER_ITEMS = NAVIGATION_ITEMS.filter((item) => item.group === 'footer');

/** The full sidebar (256 px, Figma "Leads"): logo and collapse button, the groups with their headings, then Settings and the person's card. */
function FullSidebar({ className, onCollapse }: { className: string; onCollapse: () => void }) {
  return (
    <nav
      aria-label={t('nav.main')}
      className={joinClassNames(
        'scrollbar-hidden h-full w-[256px] flex-col overflow-y-auto bg-sidebar px-3 pb-3',
        className,
      )}
    >
      <div className="flex h-[68px] shrink-0 items-center justify-between gap-2 px-2">
        <LogoOne title={t('app.name')} className="h-auto w-[58px] text-sidebar-logo" />
        <IconButton
          label={t('sidebar.collapse')}
          icon={<SidebarToggleIcon size={20} />}
          onClick={onCollapse}
          className="text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-6 pt-4 [@media(max-height:719px)]:gap-4">
        {MENU_GROUPS.map(({ group, items }) => (
          <div key={group.id} className="flex flex-col gap-1.5 [@media(max-height:719px)]:gap-1">
            {group.labelKey ? (
              <p className="text-label-xs-caps px-2.5 text-sidebar-section">{t(group.labelKey)}</p>
            ) : null}
            {items.map((item) => (
              <FullSidebarLink key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-4">
        {FOOTER_ITEMS.map((item) => (
          <FullSidebarLink key={item.id} item={item} />
        ))}
        <UserMenu variant="card" />
      </div>
    </nav>
  );
}

/**
 * The collapsed sidebar (68 px, Figma "Leads - Sidebar Minimised"): the "1" of the logo with the expand button 32 px under it,
 * the groups as columns of icon squares with a thin line between them, then Settings and the person's square avatar. It shows on
 * a tablet (where there is no room for the full one) and after the person collapses the full one on a desktop.
 */
function CompactSidebar({
  className,
  canExpand,
  onExpand,
}: {
  className: string;
  /** The expand button shows only where the full sidebar would fit (from 1280 px). */
  canExpand: boolean;
  onExpand: () => void;
}) {
  return (
    <nav
      aria-label={t('nav.main')}
      className={joinClassNames(
        'scrollbar-hidden h-full w-[68px] flex-col items-center overflow-y-auto bg-sidebar pt-6 pb-3',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-8">
        <LogoOneMark title={t('app.name')} className="text-sidebar-logo" />
        {canExpand ? (
          <IconButton
            label={t('sidebar.expand')}
            icon={<SidebarToggleIcon size={20} />}
            onClick={onExpand}
            className="hidden text-sidebar-item hover:bg-sidebar-item-active-bg hover:text-sidebar-item-hover xl:inline-flex"
          />
        ) : null}
      </div>
      <div className="mt-10 flex flex-1 flex-col items-center gap-6 [@media(max-height:719px)]:mt-6 [@media(max-height:719px)]:gap-4">
        {MENU_GROUPS.map(({ group, items }, groupPosition) => (
          <div key={group.id} className="flex flex-col items-center gap-6 [@media(max-height:719px)]:gap-4">
            {/* A thin line between one group and the next (Figma "Line 2": 32 px wide, half strength) */}
            {groupPosition > 0 ? <div aria-hidden className="h-px w-8 bg-sidebar-section opacity-50" /> : null}
            <div
              className={joinClassNames('flex flex-col items-center', group.id === 'workspace' ? 'gap-1.5' : 'gap-0.5')}
            >
              {items.map((item) => (
                <CompactSidebarLink key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 pt-4">
        {FOOTER_ITEMS.map((item) => (
          <CompactSidebarLink key={item.id} item={item} />
        ))}
        <UserMenu variant="card" isCompact />
      </div>
    </nav>
  );
}

/**
 * The dark side navigation for tablets and desktops. From 1280 px it is the full sidebar until the person collapses it; from
 * 768 to 1279 px, and after collapsing, it is the collapsed one. Both are drawn and the screen shows the right one, so the
 * switch needs no measuring. Hidden on phones, where the bottom bar takes over.
 */
export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <div className="sticky top-0 hidden h-screen shrink-0 md:block">
      <FullSidebar className={isCollapsed ? 'hidden' : 'hidden xl:flex'} onCollapse={() => setIsCollapsed(true)} />
      <CompactSidebar
        className={isCollapsed ? 'flex' : 'flex xl:hidden'}
        canExpand={isCollapsed}
        onExpand={() => setIsCollapsed(false)}
      />
    </div>
  );
}
