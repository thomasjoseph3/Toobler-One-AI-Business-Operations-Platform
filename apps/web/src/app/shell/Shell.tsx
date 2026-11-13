import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { t } from '../i18n';
import { BottomBar } from './BottomBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * The frame around every page: skip link, sidebar (tablet and desktop), top bar, the page itself, bottom bar (phone).
 * From 768 px the frame is exactly as tall as the window and only the main area scrolls, so the sidebar and the top bar never
 * move and a list page can keep its toolbar and footer in view. On a phone the whole page scrolls as usual.
 */
export function Shell() {
  const { pathname } = useLocation();
  const mainAreaRef = useRef<HTMLDivElement>(null);

  // Opening another page starts at its top (the browser only does this for the window, not for our scrolling main area)
  useEffect(() => {
    mainAreaRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen md:flex md:h-screen md:overflow-hidden">
      <a
        href="#main-content"
        className="text-body-md-semibold sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <TopBar />
        <div ref={mainAreaRef} className="flex-1 md:min-h-0 md:overflow-y-auto">
          <main
            id="main-content"
            tabIndex={-1}
            className="focus:outline-none mx-auto flex w-full max-w-[1440px] flex-col p-4 pb-24 md:h-full md:p-6 md:pb-6 xl:p-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
      <BottomBar />
    </div>
  );
}
