import { Outlet } from 'react-router';
import { LogoOne } from '@toobler-one/ui';
import { t } from './i18n';
import { ThemeSwitch } from './shell/ThemeSwitch';

/**
 * The plain frame around the pages for people who are not signed in (sign-in now; sign-up and password pages later):
 * the theme switch top right, the logo on a dark tile (the logo is drawn for a dark background), then the page's card.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex h-16 items-center justify-end px-4 md:px-6">
        <ThemeSwitch />
      </div>
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4 pb-16 md:p-6">
        <div className="mb-6 flex justify-center">
          <span className="inline-flex rounded-lg bg-sidebar px-5 py-3">
            <LogoOne title={t('app.name')} className="h-7 w-auto text-sidebar-logo" />
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
