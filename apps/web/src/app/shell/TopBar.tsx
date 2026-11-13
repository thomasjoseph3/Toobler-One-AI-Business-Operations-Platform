import { useLocation } from 'react-router';
import { BellIcon, SearchIcon } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_ITEMS } from '../navigation';
import { ThemeSwitch } from './ThemeSwitch';
import { UserMenu } from './UserMenu';

/** The words for the heading of the page at this address: the menu entry's name, "UI gallery" for the developer page, else the product name. */
function findPageTitle(pathname: string): string {
  if (pathname.startsWith('/dev/ui')) return t('topBar.uiGalleryTitle');
  const menuItem = NAVIGATION_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  return menuItem ? t(menuItem.labelKey) : t('app.name');
}

/**
 * The 64 px bar across the top (Figma): the page's heading on the left (the one h1 of every page), then search, the theme
 * button and notifications. Search and notifications are drawn as designed but switched off until their features exist
 * (search with views and filters, notifications with staff alerts). On a phone only the heading, the theme button and the
 * account button show.
 */
export function TopBar() {
  const { pathname } = useLocation();
  return (
    <div className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border-subtle bg-header px-4 md:px-6">
      <h1 className="text-heading-lg min-w-0 truncate text-text-primary">{findPageTitle(pathname)}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <label
          title={t('topBar.searchSoon')}
          className="hidden h-9 w-[240px] items-center gap-2 rounded-md border border-border-default bg-input px-3 md:flex"
        >
          <SearchIcon size={18} className="shrink-0 text-icon-secondary" />
          <span className="sr-only">{t('topBar.search')}</span>
          <input
            type="search"
            disabled
            placeholder={`${t('topBar.search')}…`}
            className="text-body-md min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-placeholder disabled:cursor-not-allowed"
          />
        </label>
        <ThemeSwitch />
        <button
          type="button"
          disabled
          title={t('topBar.notifications')}
          aria-label={t('topBar.notifications')}
          className="hidden size-10 items-center justify-center rounded-md text-icon-secondary disabled:cursor-not-allowed md:inline-flex"
        >
          <BellIcon size={20} />
        </button>
        <div className="md:hidden">
          <UserMenu variant="avatar" />
        </div>
      </div>
    </div>
  );
}
