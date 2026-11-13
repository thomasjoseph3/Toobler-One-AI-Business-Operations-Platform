import { Outlet } from 'react-router';
import { t } from '../i18n';
import { BottomBar } from './BottomBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** The frame around every page: skip link, sidebar (tablet and desktop), top bar, the page itself, bottom bar (phone). */
export function Shell() {
  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main-content"
        className="text-body-md-semibold sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="focus:outline-none mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 md:p-6 md:pb-6 xl:p-8"
        >
          <Outlet />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
