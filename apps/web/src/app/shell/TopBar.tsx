import { t } from '../i18n';
import { ThemeSwitch } from './ThemeSwitch';

/** The 64 px bar across the top. On a phone it shows the product name (there is no sidebar); the theme switch is always here. */
export function TopBar() {
  return (
    <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-subtle bg-header px-4 md:justify-end md:px-6">
      <span className="text-heading-sm text-text-primary md:hidden">{t('app.name')}</span>
      <ThemeSwitch />
    </div>
  );
}
