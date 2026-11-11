import { Outlet } from 'react-router';
import { t } from './i18n';
import { ThemeSwitch } from './shell/ThemeSwitch';

/** The plain frame around the pages for people who are not signed in (sign-in now; sign-up and password pages later). */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <span className="text-base-heading text-text-primary">{t('app.name')}</span>
        <ThemeSwitch />
      </div>
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4 pb-16 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
