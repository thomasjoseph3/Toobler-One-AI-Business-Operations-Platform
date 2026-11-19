import { useState } from 'react';
import { useLocation } from 'react-router';
import { BellIcon, SearchIcon } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_ITEMS } from '../navigation';
import { SearchBox } from './SearchBox';
import { ThemeSwitch } from './ThemeSwitch';
import { UserMenu } from './UserMenu';

/** The words for the heading of the page at this address: the menu entry's name, "UI gallery" for the developer page, else the product name. */
function findPageTitle(pathname: string): string {
  if (pathname.startsWith('/dev/ui')) return t('topBar.uiGalleryTitle');
  if (pathname === '/knowledge/test-agent') return t('testAgent.title');
  if (pathname === '/knowledge/what-you-sell') return t('knowledgeTabs.whatYouSell');
  if (pathname === '/knowledge/faqs') return t('knowledgeTabs.faqs');
  const menuItem = NAVIGATION_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  return menuItem ? t(menuItem.labelKey) : t('app.name');
}

/**
 * The 64 px bar across the top (Figma): the page's heading on the left (the one h1 of every page), then search, the theme
 * button and notifications. Search finds contacts, companies and leads (F11); notifications are drawn as designed but switched off until staff alerts exist. On a phone the
 * heading, a search button (it opens the search box in a row under the bar), the theme button and the account button show.
 */
export function TopBar() {
  const { pathname } = useLocation();
  const [isPhoneSearchOpen, setIsPhoneSearchOpen] = useState(false);
  return (
    <div className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border-subtle bg-header px-4 md:px-6">
      <h1 className="text-heading-lg min-w-0 truncate text-text-primary">{findPageTitle(pathname)}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <SearchBox className="hidden w-[240px] md:block" />
        {/* On a phone the search box opens in a row under the bar */}
        <button
          type="button"
          aria-label={t('topBar.search')}
          aria-expanded={isPhoneSearchOpen}
          onClick={() => setIsPhoneSearchOpen(!isPhoneSearchOpen)}
          className="inline-flex size-10 items-center justify-center rounded-md text-icon-secondary hover:bg-hover md:hidden"
        >
          <SearchIcon size={20} />
        </button>
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
      {isPhoneSearchOpen ? (
        <div className="absolute inset-x-0 top-full border-b border-border-subtle bg-header p-3 md:hidden">
          <SearchBox className="w-full" />
        </div>
      ) : null}
    </div>
  );
}
